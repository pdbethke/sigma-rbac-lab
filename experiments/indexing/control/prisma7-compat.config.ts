import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("schema.prisma"),
  datasource: {
    url: "file:./control.db",
  },
});
