import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export const webAssetsBucketName = (stack: cdk.Stack) =>
  `pitch-replay-assets-${stack.account}-${stack.region}`;

/** Prepare private, distribution-scoped assets before switching web traffic. */
export class WebAssetsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const distributionId = new cdk.CfnParameter(this, "DistributionId", {
      type: "String",
      allowedPattern: "^[A-Z0-9]+$",
      description:
        "Existing CloudFront distribution allowed to read web assets.",
    });
    const bucket = new s3.Bucket(this, "Assets", {
      bucketName: webAssetsBucketName(this),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [
          bucket.arnForObjects("_next/static/*"),
          bucket.arnForObjects("releases/*"),
        ],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:${this.partition}:cloudfront::${this.account}:distribution/${distributionId.valueAsString}`,
          },
        },
      }),
    );
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
  }
}
