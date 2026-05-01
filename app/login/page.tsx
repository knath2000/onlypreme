import { getProductionSiteOrigin } from "@/lib/site-url";
import LoginForm from "./login-form";

export default function LoginPage() {
  return <LoginForm siteOrigin={getProductionSiteOrigin()} />;
}
