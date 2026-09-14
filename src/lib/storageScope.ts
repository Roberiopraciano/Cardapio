/**
 * Escopo de armazenamento por empresa.
 *
 * Sem isso, todas as companies servidas pelo **mesmo domínio** dividem o mesmo
 * `localStorage`: o CPF que o cliente digitou no restaurante A fica legível para
 * a página do restaurante B. O filtro por branch que a tela de histórico faz é
 * escolha de exibição, não isolamento — o dado está lá.
 *
 * Com subdomínio por company (Fase 3 do ROADMAP) o navegador isolaria sozinho,
 * porque `localStorage` é por origem. O prefixo resolve **antes** disso, e
 * continua correto depois.
 *
 * ## Ordem de inicialização
 *
 * `setStorageScope` é chamado no boot, assim que a company é conhecida. Por isso
 * nenhum módulo pode montar a chave no topo do arquivo (`const KEY = …`): tem de
 * chamar `scopedKey()` **na hora de ler ou gravar**, senão pega o escopo vazio.
 */

/** Company atual. Vazio antes do boot ou quando a company não veio. */
let scope = ''

/**
 * Define a company do escopo. Chamado uma vez no boot.
 *
 * Trocar de company **não** migra dado: a chave passa a ser outra e o dado da
 * anterior fica intocado, invisível para esta. É o comportamento desejado.
 */
export function setStorageScope(companyId: string | undefined | null): void {
  scope = (companyId ?? '').trim()
}

export function getStorageScope(): string {
  return scope
}

/**
 * `cardapio_client` → `cardapio_client__c:6531…`
 *
 * Sem company o nome fica o legado, sem sufixo. Isso mantém o app funcionando
 * quando `GET api/company` não devolve nada — melhor guardar num escopo genérico
 * do que perder o nome do cliente a cada carregamento.
 */
export function scopedKey(base: string): string {
  return scope ? `${base}__c:${scope}` : base
}

/**
 * Lê a chave desta company e, na primeira vez, adota o valor global antigo.
 *
 * Quem já usou o app tem dado gravado sem prefixo. Ignorar isso apagaria o nome,
 * o telefone e o histórico de quem já tinha usado.
 *
 * **O legado é removido depois de adotado**, e é aí que está o cuidado: dado
 * global não tem company de origem, então adotá-lo em *todas* reproduziria
 * exatamente o vazamento que o prefixo veio consertar. Apagando na primeira
 * adoção, ele vai para uma company só e não se espalha.
 *
 * ⚠️ **Não use para consentimento.** Consentimento é ato jurídico dirigido a um
 * controlador; herdar o "aceito" dado a outra empresa é o oposto de consentir.
 * Ver `consent.ts`.
 */
export function readScopedWithMigration(base: string): string | null {
  const key = scopedKey(base)
  try {
    const own = localStorage.getItem(key)
    if (own !== null) return own

    // Sem escopo, a chave já É a legada — nada a migrar
    if (!scope) return null

    const legacy = localStorage.getItem(base)
    if (legacy === null) return null

    localStorage.setItem(key, legacy)
    localStorage.removeItem(base)
    return legacy
  } catch {
    // Modo privado ou cota estourada: seguir sem storage é melhor que quebrar
    return null
  }
}
