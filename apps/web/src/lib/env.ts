export function appSecretConfig() {
  const secretJson = process.env.APP_SECRET_JSON;
  if (secretJson) {
    const parsed = JSON.parse(secretJson) as Partial<{
      sessionSecret: string;
      modelBaseUrl: string;
      modelApiKey: string;
      modelLambdaFunctionName: string;
    }>;
    return {
      ...parsed,
      sessionSecret: process.env.SESSION_SECRET ?? parsed.sessionSecret,
      modelBaseUrl: process.env.MODEL_BASE_URL ?? parsed.modelBaseUrl,
      modelApiKey: process.env.MODEL_API_KEY ?? parsed.modelApiKey,
      modelBackend: process.env.MODEL_BACKEND,
      modelLambdaFunctionName: process.env.MODEL_LAMBDA_FUNCTION_NAME ?? parsed.modelLambdaFunctionName
    };
  }
  return {
    sessionSecret: process.env.SESSION_SECRET,
    modelBaseUrl: process.env.MODEL_BASE_URL,
    modelApiKey: process.env.MODEL_API_KEY,
    modelBackend: process.env.MODEL_BACKEND,
    modelLambdaFunctionName: process.env.MODEL_LAMBDA_FUNCTION_NAME
  };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
