import { describe, expect, it, vi } from "vitest";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { stopLambda, stopDistribution } from "./cost-control";

describe("cost shutdown AWS boundaries", () => {
  it("removes every provisioned allocation before setting concurrency to zero", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ProvisionedConcurrencyConfigs: [
          { FunctionArn: "arn:aws:lambda:us-east-1:123:function:web:live" },
        ],
        NextMarker: "page2",
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ProvisionedConcurrencyConfigs: [
          { FunctionArn: "arn:aws:lambda:us-east-1:123:function:web:2" },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ReservedConcurrentExecutions: 10 })
      .mockResolvedValueOnce({});
    await stopLambda({ send } as unknown as LambdaClient, "web");
    expect(send.mock.calls.map(([c]) => c.constructor.name)).toEqual([
      "ListProvisionedConcurrencyConfigsCommand",
      "DeleteProvisionedConcurrencyConfigCommand",
      "ListProvisionedConcurrencyConfigsCommand",
      "DeleteProvisionedConcurrencyConfigCommand",
      "GetFunctionConcurrencyCommand",
      "PutFunctionConcurrencyCommand",
    ]);
    expect(send.mock.calls[1][0].input).toEqual({
      FunctionName: "web",
      Qualifier: "live",
    });
    expect(send.mock.calls[2][0].input.Marker).toBe("page2");
    expect(send.mock.calls[3][0].input.Qualifier).toBe("2");
    expect(send.mock.calls[5][0].input.ReservedConcurrentExecutions).toBe(0);
  });
  it("leaves an already stopped function alone", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ReservedConcurrentExecutions: 0 });
    await stopLambda({ send } as unknown as LambdaClient, "web");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("surfaces a failed capacity removal for retry", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ProvisionedConcurrencyConfigs: [
          { FunctionArn: "arn:aws:lambda:us-east-1:123:function:web:live" },
        ],
      })
      .mockRejectedValueOnce(new Error("access denied"));
    await expect(
      stopLambda({ send } as unknown as LambdaClient, "web"),
    ).rejects.toThrow("access denied");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("preserves the complete CloudFront config and uses its revision when disabling traffic", async () => {
    const config = {
      Enabled: true,
      CallerReference: "existing",
      Origins: { Quantity: 2 },
      Comment: "keep",
    };
    const send = vi
      .fn()
      .mockResolvedValueOnce({ DistributionConfig: config, ETag: "revision" })
      .mockResolvedValueOnce({});
    await stopDistribution(
      { send } as unknown as CloudFrontClient,
      "distribution",
    );
    expect(send.mock.calls[1][0].input).toEqual({
      Id: "distribution",
      IfMatch: "revision",
      DistributionConfig: { ...config, Enabled: false },
    });
    expect(config.Enabled).toBe(true);
  });
  it("does not repeatedly update a disabled distribution", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        DistributionConfig: { Enabled: false },
        ETag: "revision",
      });
    await stopDistribution(
      { send } as unknown as CloudFrontClient,
      "distribution",
    );
    expect(send).toHaveBeenCalledOnce();
  });
});
