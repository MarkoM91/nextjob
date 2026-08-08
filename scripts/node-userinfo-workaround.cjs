/* eslint-disable @typescript-eslint/no-require-imports */
// Work around a Windows/libuv sandbox issue where os.userInfo() can report
// ENOMEM even when memory is available. Drizzle Kit uses it only to locate a
// user directory; these values come from the current Windows environment.
const os = require("node:os");

os.userInfo = () => ({
  uid: -1,
  gid: -1,
  username: process.env.USERNAME || "codex",
  homedir: process.env.USERPROFILE || process.cwd(),
  shell: null,
});
