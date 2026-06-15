import { createApp } from "./app";
import { createAppContext } from "./bootstrap/create-app-context";
import { env } from "./config/env";

async function bootstrap(): Promise<void> {
  const context = await createAppContext();
  const app = createApp(context);

  app.listen(env.PORT, () => {
    context.logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV
      },
      "Security AI Lab backend started"
    );
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to bootstrap backend", error);
  process.exit(1);
});
