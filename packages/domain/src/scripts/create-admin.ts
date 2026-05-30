import { AuthService } from "../auth/auth.service.js";

function readArg(name: string) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return exact?.slice(name.length + 3);
}

const email = readArg("email");
const password = readArg("password");

if (!email || !password) {
  console.error("Usage: pnpm script:create-admin --email=admin@example.com --password=secret123");
  process.exit(1);
}

const service = new AuthService();

service
  .createAdmin(email, password)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
