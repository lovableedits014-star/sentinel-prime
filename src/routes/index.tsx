import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import App from "@/App";

export const Route = createFileRoute("/")({
  component: () => (
    <ClientOnly fallback={<div />}>
      <App />
    </ClientOnly>
  ),
});
