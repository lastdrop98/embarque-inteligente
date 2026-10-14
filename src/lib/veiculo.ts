// Compatibilidade: a tabela veiculos só tem a coluna "nome".
// Marca e modelo são guardados juntos em "nome" ("Marca Modelo") até existir
// migração com colunas próprias (ver docs/proposta-migracao-pontos-veiculos.sql).
export function juntarMarcaModelo(marca: string, modelo: string) {
  return `${marca.trim()} ${modelo.trim()}`.trim();
}

export function separarMarcaModelo(nome: string | null | undefined) {
  const limpo = (nome ?? "").trim().replace(/\s+/g, " ");
  const i = limpo.indexOf(" ");
  if (i < 0) return { marca: limpo, modelo: "" };
  return { marca: limpo.slice(0, i), modelo: limpo.slice(i + 1) };
}

/** Traduz erros da base de dados para mensagens legíveis em português. */
export function mensagemErro(e: unknown) {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23503") return "Não é possível eliminar: existem rotas, bilhetes ou histórico associados. Desactive ou cancele em vez de eliminar.";
  if (err?.code === "23505") return "Já existe um registo com estes dados.";
  if (err?.code === "42501") return "Não tem permissão para esta acção.";
  return err?.message ?? "Ocorreu um erro.";
}
