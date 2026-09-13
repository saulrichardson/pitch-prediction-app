import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as eventSources from "aws-cdk-lib/aws-lambda-event-sources";
import path from "node:path";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { webAssetsBucketName } from "./web-assets-stack";

export class PitchSequenceServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repositoryName =
      process.env.ECR_REPOSITORY_NAME ?? "pitch-prediction-app";
    const webImageTag =
      process.env.SERVERLESS_WEB_IMAGE_TAG ??
      process.env.IMAGE_TAG ??
      "serverless-latest";
    const webMemoryMb = Number(process.env.SERVERLESS_WEB_MEMORY_MB ?? "2048");
    if (!/^[A-Za-z0-9._-]+$/.test(webImageTag))
      throw new Error(
        "The web release tag must be a valid asset path segment.",
      );
    const webTimeoutSeconds = Number(
      process.env.SERVERLESS_WEB_TIMEOUT_SECONDS ?? "30",
    );
    const webReservedConcurrency = Number(
      process.env.SERVERLESS_WEB_RESERVED_CONCURRENCY ?? "10",
    );
    const allowedCountries = countriesFromEnv(
      process.env.CLOUDFRONT_ALLOWED_COUNTRIES ?? "US",
    );
    const customDomainName = process.env.CUSTOM_DOMAIN_NAME;
    const certificateArn = process.env.ACM_CERTIFICATE_ARN;

    if (
      (customDomainName && !certificateArn) ||
      (!customDomainName && certificateArn)
    ) {
      throw new Error(
        "CUSTOM_DOMAIN_NAME and ACM_CERTIFICATE_ARN must be configured together.",
      );
    }

    const repository = ecr.Repository.fromRepositoryName(
      this,
      "Repository",
      repositoryName,
    );
    const table = new dynamodb.Table(this, "StateTable", {
      tableName: "pitch-sequence-serverless-state",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const tableResource = table.node.defaultChild as dynamodb.CfnTable;
    tableResource.onDemandThroughput = {
      maxReadRequestUnits: 25,
      maxWriteRequestUnits: 10,
    };

    const appSecret = new secretsmanager.Secret(this, "AppSecrets", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "sessionSecret",
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    const webLogGroup = new logs.LogGroup(this, "WebFunctionLogGroup", {
      logGroupName: "/aws/lambda/pitch-sequence-serverless-web",
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const webFunction = new lambda.DockerImageFunction(this, "WebFunction", {
      functionName: "pitch-sequence-serverless-web",
      code: lambda.DockerImageCode.fromEcr(repository, {
        tagOrDigest: webImageTag,
      }),
      architecture: lambda.Architecture.X86_64,
      memorySize: webMemoryMb,
      timeout: cdk.Duration.seconds(webTimeoutSeconds),
      reservedConcurrentExecutions: webReservedConcurrency,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
      logGroup: webLogGroup,
      environment: {
        NODE_ENV: "production",
        STORAGE_MODE: "dynamodb",
        DYNAMODB_TABLE_NAME: table.tableName,
        APP_SECRET_JSON: appSecret.secretValue.toString(),
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      },
    });

    table.grantReadWriteData(webFunction);

    const preparationLogs = new logs.LogGroup(this, "PreparationLogGroup", {
      logGroupName: "/aws/lambda/pitch-sequence-game-preparation",
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const modelName = "pitch-sequence-serverless-model-lambda";
    const prepareFunction = new lambdaNode.NodejsFunction(
      this,
      "PrepareGameFunction",
      {
        functionName: "pitch-sequence-game-preparation",
        entry: path.resolve(
          import.meta.dirname,
          "../functions/prepare-game.ts",
        ),
        depsLockFilePath: path.resolve(
          import.meta.dirname,
          "../../package-lock.json",
        ),
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: cdk.Duration.seconds(540),
        reservedConcurrentExecutions: 1,
        logGroup: preparationLogs,
        bundling: { externalModules: [], target: "node24", minify: true },
        environment: {
          STORAGE_MODE: "dynamodb",
          DYNAMODB_TABLE_NAME: table.tableName,
          MODEL_INVOKE_TARGET: `${modelName}:live`,
        },
      },
    );
    prepareFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [table.tableArn],
        conditions: {
          "ForAllValues:StringLike": {
            "dynamodb:LeadingKeys": [
              "REPLAY#game-job:*",
              "REPLAY#edition:*",
              "REPLAY#game-edition:*",
              "REPLAY#catalog-editions:*",
              "REPLAY#forecast:*",
              "REPLAY#preparation-lock:*",
              "REPLAY#preparation-budget:*",
            ],
          },
        },
      }),
    );
    prepareFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:GetFunction", "lambda:InvokeFunction"],
        resources: [
          `arn:${this.partition}:lambda:${this.region}:${this.account}:function:${modelName}:*`,
        ],
      }),
    );
    prepareFunction.addEventSource(
      new eventSources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 1,
        retryAttempts: 2,
        maxRecordAge: cdk.Duration.hours(1),
        filters: [
          lambda.FilterCriteria.filter({
            dynamodb: {
              NewImage: {
                key: { S: lambda.FilterRule.beginsWith("game-job:") },
                value: { M: { status: { S: ["queued"] } } },
              },
            },
          }),
        ],
      }),
    );
    const functionUrl = webFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(
          this,
          "CustomDomainCertificate",
          certificateArn,
        )
      : undefined;

    const functionOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(
      functionUrl,
      {
        readTimeout: cdk.Duration.seconds(60),
        keepaliveTimeout: cdk.Duration.seconds(60),
      },
    );
    const functionOriginRequestPolicy =
      cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

    const assetsBucket = s3.Bucket.fromBucketName(
      this,
      "WebAssets",
      webAssetsBucketName(this),
    );
    const assetsOrigin =
      origins.S3BucketOrigin.withOriginAccessControl(assetsBucket);
    const releaseDocument = new cloudfront.Function(this, "ReleaseDocument", {
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
        var request = event.request;
        request.uri = ${JSON.stringify(`/releases/${webImageTag}`)} +
          (request.uri === '/' ? '/index.html' : request.uri);
        return request;
      }`),
    });

    const forwardViewerHost = new cloudfront.Function(
      this,
      "ForwardViewerHost",
      {
        code: cloudfront.FunctionCode.fromInline(`function handler(event) {
        var request = event.request;
        request.headers['x-forwarded-host'] = { value: request.headers.host.value };
        return request;
      }`),
      },
    );

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        functionAssociations: [
          {
            function: forwardViewerHost,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
        origin: functionOrigin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: functionOriginRequestPolicy,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/": {
          origin: assetsOrigin,
          functionAssociations: [
            {
              function: releaseDocument,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        "/_next/static/*": {
          origin: assetsOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        "/favicon.svg": {
          origin: assetsOrigin,
          functionAssociations: [
            {
              function: releaseDocument,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        "/api/replays": {
          origin: functionOrigin,
          functionAssociations: [
            {
              function: forwardViewerHost,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          // Only the public GET summary opts in via s-maxage. A zero minimum
          // and default TTL preserve no-store on mutations and failures.
          cachePolicy: new cloudfront.CachePolicy(this, "PublicSummaryCache", {
            minTtl: cdk.Duration.seconds(0),
            defaultTtl: cdk.Duration.seconds(0),
            maxTtl: cdk.Duration.seconds(30),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
          originRequestPolicy: functionOriginRequestPolicy,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
      ...(customDomainName && certificate
        ? {
            domainNames: [customDomainName],
            certificate,
            minimumProtocolVersion:
              cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
          }
        : {}),
      ...(allowedCountries.length > 0
        ? {
            geoRestriction: cloudfront.GeoRestriction.allowlist(
              ...allowedCountries,
            ),
          }
        : {}),
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: "Pitch Prediction App serverless web/API distribution",
    });

    webFunction.addPermission("AllowCloudFrontInvokeFunctionViaUrl", {
      principal: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:${cdk.Aws.PARTITION}:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${distribution.distributionId}`,
      invokedViaFunctionUrl: true,
    });

    new cdk.CfnOutput(this, "ServerlessWebUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });

    if (customDomainName) {
      new cdk.CfnOutput(this, "CustomDomainUrl", {
        value: `https://${customDomainName}`,
      });
    }

    new cdk.CfnOutput(this, "ServerlessStateTableName", {
      value: table.tableName,
    });

    new cdk.CfnOutput(this, "ServerlessWebFunctionName", {
      value: webFunction.functionName,
    });
  }
}

function countriesFromEnv(raw: string): string[] {
  return raw
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
}
