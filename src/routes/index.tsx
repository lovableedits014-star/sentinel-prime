import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinelle — Gestão política e WhatsApp" },
      {
        name: "description",
        content: "Sistema Sentinelle para gestão política, campanhas, telemarketing, missões e comunicação por WhatsApp.",
      },
      { property: "og:title", content: "Sentinelle — Gestão política e WhatsApp" },
      {
        property: "og:description",
        content: "Central de gestão política com campanhas, contatos, telemarketing, missões e WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});
