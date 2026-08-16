import { App } from "./core/App";

export function initEditor(): App {
  const app = new App();
  app.start();
  return app;
}
