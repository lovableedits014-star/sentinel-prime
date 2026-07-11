// Testes do motor de variação de mensagens.
// Rodam com: deno test supabase/functions/_shared/message-variation.test.ts
// e também servem de fixture para o motor isomórfico do frontend.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  applyPlaceholders,
  expandSpintax,
  hasQuestionAtEnd,
  protectUrls,
  renderMessage,
  renderPreviewBatch,
  restoreUrls,
  validateSpintax,
} from "./message-variation.ts";

// RNG determinístico para testes: sequência fixa em [0,1).
function seededRng(seeds: number[]): () => number {
  let i = 0;
  return () => seeds[i++ % seeds.length];
}

Deno.test("protectUrls extrai e restaura URLs sem mudança", () => {
  const original = "Veja aqui https://exemplo.com/a?x=1 e https://outra.com!";
  const { masked, urls } = protectUrls(original);
  assertEquals(urls.length, 2);
  assert(!masked.includes("https://"));
  const restored = restoreUrls(masked, urls);
  assertEquals(restored, original);
});

Deno.test("expandSpintax escolhe uma opção", () => {
  const rng = seededRng([0.0, 0.99, 0.5]);
  const out = expandSpintax("{Olá|Oi|E aí}, tudo bem?", rng);
  assertEquals(out, "Olá, tudo bem?");
});

Deno.test("expandSpintax preserva placeholders sem pipe", () => {
  const rng = seededRng([0.0]);
  const out = expandSpintax("{Oi|Olá} {nome}!", rng);
  assertEquals(out, "Oi {nome}!");
});

Deno.test("expandSpintax resolve blocos [[A|B]]", () => {
  const rng = seededRng([0.9, 0.0]);
  const out = expandSpintax("[[Bloco A longo|Bloco B curto]]", rng);
  assertEquals(out, "Bloco B curto");
});

Deno.test("expandSpintax lida com spintax aninhada", () => {
  const rng = seededRng([0.0, 0.0, 0.0]);
  // A escolha externa vira "Olá {mundo|galera}", depois o interno vira "mundo"
  const out = expandSpintax("{Olá {mundo|galera}|Bom dia}", rng);
  assertEquals(out, "Olá mundo");
});

Deno.test("validateSpintax detecta chaves desbalanceadas", () => {
  assertEquals(validateSpintax("{a|b").ok, false);
  assertEquals(validateSpintax("a|b}").ok, false);
  assertEquals(validateSpintax("[[a|b]").ok, false);
  assertEquals(validateSpintax("{a|b} e [[c|d]]").ok, true);
});

Deno.test("applyPlaceholders substitui nome e primeiro_nome", () => {
  const out = applyPlaceholders(
    "Oi {primeiro_nome}, {nome}!",
    { nome: "João da Silva" },
    { rng: () => 0 },
  );
  assertEquals(out, "Oi João, João da Silva!");
});

Deno.test("hasQuestionAtEnd detecta pergunta no final", () => {
  assertEquals(hasQuestionAtEnd("Tudo bem?"), true);
  assertEquals(hasQuestionAtEnd("Tudo bem"), false);
  assertEquals(hasQuestionAtEnd("Confirma? 🙏"), true);
});

Deno.test("renderMessage: retrocompatível — sem spintax, comporta-se como replace", () => {
  const r = renderMessage("Olá {nome}, tudo bem?", { nome: "Maria" });
  assertEquals(r.text, "Olá Maria, tudo bem?");
  assertEquals(r.ctaUsed, null);
  assertEquals(r.warnings.length, 0);
});

Deno.test("renderMessage: preserva URL 100% mesmo com spintax e placeholders", () => {
  const template = "{Oi|Olá} {nome}! Veja: https://exemplo.com/promo?id=42 [[Vai gostar|Recomendo]].";
  const r = renderMessage(template, { nome: "Ana" }, { rng: seededRng([0.0, 0.9]) });
  assertStringIncludes(r.text, "https://exemplo.com/promo?id=42");
  assertEquals(r.warnings.length, 0);
});

Deno.test("renderMessage: injeta CTA quando {cta_resposta} está no template", () => {
  const template = "Oi {nome}! {cta_resposta}";
  const r = renderMessage(template, { nome: "Bia" }, { cta: "Você concorda?" });
  assertEquals(r.text, "Oi Bia! Você concorda?");
  assertEquals(r.ctaUsed, "Você concorda?");
});

Deno.test("renderMessage: auto-anexa CTA quando pedido e texto não termina em pergunta", () => {
  const r = renderMessage("Oi {nome}, boa notícia.", { nome: "Léo" }, {
    cta: "Faz sentido?",
    autoAppendCta: true,
  });
  assertStringIncludes(r.text, "Faz sentido?");
  assertEquals(r.ctaUsed, "Faz sentido?");
});

Deno.test("renderMessage: NÃO anexa CTA quando texto já termina em pergunta", () => {
  const r = renderMessage("Oi {nome}, tudo bem?", { nome: "Léo" }, {
    cta: "Faz sentido?",
    autoAppendCta: true,
  });
  assertEquals(r.text, "Oi Léo, tudo bem?");
  assertEquals(r.ctaUsed, null);
});

Deno.test("renderMessage: spintax malformada cai para fallback literal", () => {
  const r = renderMessage("Oi {nome}, {a|b", { nome: "Zé" });
  assertEquals(r.text, "Oi Zé, {a|b");
  assertEquals(r.warnings[0].startsWith("spintax_invalid"), true);
});

Deno.test("renderPreviewBatch calcula unicidade", () => {
  const template = "{Oi|Olá|E aí} {primeiro_nome}!";
  const recipients = [
    { nome: "Ana" }, { nome: "Bia" }, { nome: "Caio" }, { nome: "Duda" }, { nome: "Eva" },
  ];
  // rng varia → tende a gerar mais de uma variante
  const batch = renderPreviewBatch(template, recipients);
  assertEquals(batch.total, 5);
  assert(batch.uniqueCount >= 1);
});
