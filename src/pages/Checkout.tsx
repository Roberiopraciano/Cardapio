import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useAppStore } from '../store/appStore'
import { api, OrderError, MesaError } from '../api/client'
import { formatCurrency, calcCartItemSubtotal, calcPackagingTotal, calcTmProduto } from '../lib/pricing'
import { checkBranchOpen } from '../lib/businessPeriod'
import { isOutOfStock, checkValidPeriod } from '../lib/stock'
import { parsePeriod } from '../lib/dataLinker'
import ImageWithFallback from '../components/ImageWithFallback'
import HeaderButton from '../components/HeaderButton'
import Icon from '../components/Icon'
import { pushOrderHistory } from '../lib/orderHistory'
import {
  checkIdentity, identityMessage, maskPhoneInput, phoneDigits, phoneState, PHONE_MESSAGE,
} from '../lib/identity'
import { maskCPFInput, cpfState, CPF_MESSAGE } from '../lib/client_storage'
import { toast } from '../store/toastStore'
import GoogleSignInButton from '../components/GoogleSignInButton'
import ConfirmModal from '../components/ConfirmModal'
import { Analytics } from '../lib/analytics'
import { saveTotemHandoff } from '../lib/totemHandoff'
import { buildOrderPayload } from '../lib/orderPayload'
import { whereConsumeForMode } from '../lib/whereConsume'
import { readOrderTrackingConfig } from '../lib/orderTracking'
import { paymentOptionsFor } from '../lib/paymentOptions'
import { locationTypeFor } from '../lib/locationType'
import PinModal from '../components/PinModal'
import { isPinStillValid, markPinVerified } from '../lib/pin'
import MesaBlockedModal from '../components/MesaBlockedModal'
import {
  classifyMesa, loadMesaSession, saveMesaSession, clearMesaSession, getMesaClientOrderId,
  adoptClientOrderId, buildMesaItems, MesaItemError, mesaErrorMessage, SESSION_ERROR_CODES,
  type MesaStatusData,
} from '../lib/mesaErp'
import { tableLabel } from '../lib/tableLabel'

export default function Checkout() {
  const navigate = useNavigate()
  const {
    items, orderNote, clientName, clientPhone, clientCpf,
    whereConsume, consumptioncode, consumptionint, appliedCoupon, couponCode,
    clientEmail, setClientEmail,
    setOrderNote, setClientName, setClientPhone, setClientCpf,
    setCoupon, total, totalWithCoupon, itemCount, clearCart, loadSavedClient,
    comanda, setComanda, clearCartKeepCodes, setWhereConsumeAsked,
  } = useCartStore()
  const { branch, params, periods, products } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [couponInput, setCouponInput] = useState(couponCode)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [confirmModality, setConfirmModality] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [paymentKey, setPaymentKey] = useState<string | null>(null)
  // Mesa integrada ao ERP: PIN só para ABRIR a mesa; mesa de outro canal pede o garçom
  const [erpPinOpen, setErpPinOpen] = useState(false)
  const [mesaBlocked, setMesaBlocked] = useState<'ocupada' | 'bloqueada' | null>(null)
  // A resposta do envio pode ter se perdido: o botão vira "Tentar novamente" (mesmo loteId)
  const [needsRetry, setNeedsRetry] = useState(false)
  // undefined = consultando; null = mesa sem número cadastrado
  const [tableNumber, setTableNumber] = useState<number | null | undefined>(undefined)
  const [openedAt] = useState(() => new Date())
  // Um id por abertura do checkout: reenviar depois de falha de rede não duplica o pedido
  const [clientOrderId] = useState(() => crypto.randomUUID())
  const mode = params?.mode ?? 'mesa'
  const packagingTotal = calcPackagingTotal(items)

  /** "Pagar no totem" é independente do cadastro geral do Cardápio. */
  const cardapioHandoffEnabled = branch?.settingsTotem?.['cardapioHandoffEnabled']
  const totemEnabled = branch?.settingsTotem?.['totemEnabled']
  const configuredPayAtTotem = branch?.settingsWeb?.paymentMethods?.payAtTotem
  const channelConfig = branch?.settingsWeb?.paymentMethods?.[mode]
  const consumptionOptions = whereConsumeForMode(mode, branch?.settingsTotem)
  // "Pagar no totem" é forma de pagamento de cada modalidade (balcão, mesa e
  // delivery). Sem o campo no cadastro da unidade vale a regra antiga, global.
  const totemAvailable = typeof channelConfig?.totem === 'boolean'
    ? channelConfig.totem && cardapioHandoffEnabled !== false && totemEnabled !== false
    : typeof configuredPayAtTotem === 'boolean'
      ? configuredPayAtTotem && cardapioHandoffEnabled !== false && totemEnabled !== false
      : typeof branch?.settingsWeb?.totemPaymentEnabled === 'boolean'
        ? branch.settingsWeb.totemPaymentEnabled
        : cardapioHandoffEnabled === true

  /** Formas marcadas na API para esta modalidade — no balcão são escolhidas aqui; mesa e delivery ainda só em "Fechar conta" (desabilitado). */
  const methodOptions = paymentOptionsFor(channelConfig)
  const otherMethods = methodOptions.filter((m) => m.key !== 'totem')
  // No balcão a forma é escolhida aqui e vai no pedido; mesa e delivery seguem em "Fechar conta"
  const pickPayment = mode === 'balcao' && otherMethods.length > 0
  // Como na mesa, "Pagar no totem" convive com as outras formas: aqui é uma escolha
  // como as demais e o pedido segue normal, só registrando a forma.
  const selectedPayment = methodOptions.find((m) => m.key === paymentKey)
  const closeBillLabels = [
    ...methodOptions.map((m) => m.label),
    // Cadastro antigo: totem liberado pela regra global, sem a forma no canal
    ...(totemAvailable && !methodOptions.some((m) => m.key === 'totem') ? ['Pagar no totem'] : []),
  ]
  // A mesa SEMPRE envia o pedido. Nas demais, "Pagar no totem" só conduz o pedido
  // (QR Code) quando é a única forma cadastrada; com outras formas, enviar o
  // pedido não cobra nada.
  // No balcão, com outras formas ao lado, o QR só sai se o cliente escolher o totem.
  const viaTotem = mode !== 'mesa' && totemAvailable
    && (otherMethods.length === 0 || (pickPayment && selectedPayment?.key === 'totem'))

  /** PIN ao enviar o pedido: só na mesa, e não no totem (lá quem confirma é o TEF). */
  const mesaErp = mode === 'mesa' && branch?.settingsWeb?.mesaErpEnabled === true
  // Com a mesa no ERP o PIN passa a abrir a mesa (ver `prepareMesa`), não a confirmar cada envio
  const pinEnabled = mode === 'mesa' && branch?.settingsWeb?.usePinOnPayment === true && !mesaErp
  const pinRequired = pinEnabled && !viaTotem && typeof tableNumber === 'number'

  // Comanda por cliente dentro da mesa — só quando a branch liga a opção
  const comandaEnabled = mode === 'mesa' && branch?.settingsWeb?.comandaEnabled === true
  const comandaLabel = branch?.settingsWeb?.comandaLabel?.trim() || 'Comanda'
  const comandaRequired = branch?.settingsWeb?.comandaRequired === true

  const branchAllowsCoupons = branch?.settingsWeb?.couponsEnabled === true
  const COUPONS_ENABLED = branchAllowsCoupons

  /** E-mail é opt-in por branch: quem não usa não deve pedir dado que não vai
   *  tratar — coletar sem finalidade é justamente o que a LGPD veda. */
  const askEmail = branch?.settingsWeb?.askEmail === true

  /** Nome + telefone para enviar pedido. Navegar o cardápio segue livre. */
  const requireId = branch?.settingsWeb?.requireIdentification !== false
  const identity = checkIdentity(clientName, clientPhone)

  /** CPF é opcional, mas se preenchido tem de ser válido — vai na nota fiscal. */
  const cpf = cpfState(clientCpf)

  const FIELDS = [
    {
      key: 'name', type: 'text', inputMode: 'text' as const, autoComplete: 'name',
      placeholder: 'Seu nome', value: clientName, onChange: setClientName,
    },
    {
      key: 'phone', type: 'tel', inputMode: 'tel' as const, autoComplete: 'tel',
      placeholder: '(99) 999999999', value: maskPhoneInput(clientPhone),
      onChange: (v: string) => setClientPhone(phoneDigits(v)),
      error: PHONE_MESSAGE[phoneState(clientPhone)],
      valid: phoneState(clientPhone) === 'valid',
    },
    ...(askEmail ? [{
      key: 'email', type: 'email', inputMode: 'email' as const, autoComplete: 'email',
      placeholder: 'E-mail (opcional)', value: clientEmail, onChange: setClientEmail,
    }] : []),
    {
      key: 'cpf', type: 'text', inputMode: 'numeric' as const, autoComplete: 'off',
      placeholder: 'CPF na nota (opcional)', value: clientCpf,
      // Máscara enquanto digita + corte em 11 dígitos
      onChange: (v: string) => setClientCpf(maskCPFInput(v)),
      error: CPF_MESSAGE[cpf],
      valid: cpf === 'valid',
    },
  ]

  const subtotal = total()
  const finalTotal = totalWithCoupon()
  const tmProduto = calcTmProduto(items, finalTotal)
  const isEmpty = items.length === 0

  // Redirect e analytics só no mount — nunca durante o render, senão o
  // carrinho vazio derruba a tela em branco.
  useEffect(() => {
    if (isEmpty) { navigate('/', { replace: true }); return }
    loadSavedClient()
    Analytics.beginCheckout(items, finalTotal)
  }, [])

  // Número da mesa vem do cadastro (o QR traz só o código). Se a consulta falhar
  // ou a mesa não tiver número, o PIN não pode ser conferido: segue sem ele, em
  // vez de travar a venda por um soluço de rede.
  useEffect(() => {
    if (!(pinEnabled || mesaErp) || !params?.branchId || !params.table) return
    let cancelled = false
    api.getTableNumber(params.branchId, params.table)
      .then((n) => { if (!cancelled) setTableNumber(n) })
      .catch((e) => {
        console.warn('[pin] não foi possível consultar o número da mesa', e)
        if (!cancelled) setTableNumber(null)
      })
    return () => { cancelled = true }
  }, [pinEnabled, mesaErp, params?.branchId, params?.table])

  // A cotação pertence ao carrinho que foi validado. Se quantidade ou itens
  // mudarem, remove o desconto antigo e exige uma nova validação na API.
  useEffect(() => {
    if (!appliedCoupon) return
    if (appliedCoupon.validatedSubtotal === subtotal) return
    setCoupon(null, couponCode)
    setCouponError('O carrinho mudou. Aplique o cupom novamente para recalcular o desconto.')
  }, [subtotal])

  useEffect(() => {
    if (!branch || branchAllowsCoupons || !appliedCoupon) return
    setCoupon(null, '')
  }, [branch, branchAllowsCoupons, appliedCoupon, setCoupon])

  if (isEmpty) return null

  /**
   * Volta à tela inicial para refazer a escolha. Esvazia o carrinho antes:
   * itens montados numa modalidade não podem sobreviver à troca sem serem
   * recalculados, e um carrinho com preços de duas modalidades é pior que
   * pedir para o cliente montar de novo.
   */
  const handleChangeModality = () => {
    if (items.length > 0) { setConfirmModality(true); return }
    doChangeModality()
  }

  const doChangeModality = () => {
    setConfirmModality(false)
    clearCartKeepCodes()
    setWhereConsumeAsked(false)
    navigate('/', { replace: true })
  }

  const handleApplyCoupon = async () => {
    if (!COUPONS_ENABLED) return
    if (appliedCoupon) {
      setCoupon(null, '')
      setCouponInput('')
      setCouponError(null)
      return
    }
    setCouponError(null)
    if (!couponInput.trim()) { setCoupon(null, ''); return }
    setCouponLoading(true)
    try {
      const validation = await api.validateCoupon({
        code: couponInput.trim(),
        branch: params?.branchId ?? '',
        subtotal,
        locationType: locationTypeFor(mode),
        customer: clientCpf.replace(/\D/g, '') || clientPhone.replace(/\D/g, '') || undefined,
        items: items.map((item) => ({
          product: item.product._id,
          price: item.product.price,
          quantity: item.quantity,
          amount: calcCartItemSubtotal(item),
          complements: item.addedComplements,
        })),
      })
      if (!validation.valid || !validation.offer) {
        setCoupon(null, '')
        setCouponError(validation.valid
          ? 'Não foi possível carregar os dados do cupom. Tente novamente.'
          : validation.message || 'Cupom inválido para este pedido.')
        return
      }

      setCoupon({
        ...validation.offer,
        validatedDiscount: validation.discount,
        validatedSubtotal: subtotal,
      }, couponInput.trim())
      setCouponError(null)
      Analytics.applyCoupon(couponInput, subtotal)
    } catch (e) {
      console.warn('[cupom] falha ao validar', e)
      setCouponError('Não foi possível validar o cupom. Tente novamente.')
    } finally {
      setCouponLoading(false)
    }
  }

  /** `pinOk`: o modal do PIN já validou — pula direto para o envio. */
  const mesaBranchId = params?.branchId ?? ''
  const mesaTable = params?.table ?? ''

  /**
   * Mesa integrada ao ERP: garante uma sessão válida antes de enviar.
   * @returns true se já dá para lançar; false se parou num passo que tem tela
   * (PIN para abrir, mesa ocupada, erro) — quem chamou apenas retorna.
   */
  const prepareMesa = async (): Promise<boolean> => {
    if (tableNumber === undefined) {
      setError('Aguarde um instante e confirme de novo.')
      return false
    }
    if (tableNumber === null) {
      const msg = 'Esta mesa não tem número cadastrado. Chame o garçom.'
      setError(msg); toast.error(msg)
      return false
    }
    if (loadMesaSession(mesaBranchId, mesaTable)) return true

    const clientOrderId = getMesaClientOrderId(mesaBranchId, mesaTable)
    setLoading(true); setError(null)
    try {
      const res = await api.mesaStatus({ branchId: mesaBranchId, clientOrderId, numeroMesa: tableNumber })
      const gate = classifyMesa(res.data as MesaStatusData, clientOrderId)
      if (gate === 'minha' && res.mesaToken) {
        saveMesaSession(mesaBranchId, mesaTable, { clientOrderId, mesaToken: res.mesaToken, numeroMesa: tableNumber })
        return true
      }
      // 'minha' sem token = a nuvem não conhece essa sessão: refaz pelo PIN
      if (gate === 'livre' || gate === 'minha') { setErpPinOpen(true); return false }
      setMesaBlocked(gate)
      return false
    } catch (e) {
      const msg = e instanceof MesaError
        ? mesaErrorMessage(e.code, e.isOffline ? 'Não foi possível falar com o restaurante. Verifique a conexão.' : undefined)
        : 'Não foi possível verificar a mesa. Tente novamente.'
      setError(msg); toast.error(msg)
      return false
    } finally { setLoading(false) }
  }

  /** PIN certo na tela (mesa + hora): abre a mesa na loja e segue com o envio. */
  const abrirMesa = async (pin: string) => {
    setErpPinOpen(false)
    if (typeof tableNumber !== 'number') return
    setLoading(true); setError(null)
    try {
      const res = await api.mesaAbrir({
        branchId: mesaBranchId, numeroMesa: tableNumber, pin,
        nomeCliente: clientName.trim() || undefined,
      })
      const clientOrderId = String(res.data?.clientOrderId ?? '')
      if (!clientOrderId || !res.mesaToken) throw new MesaError(500)
      adoptClientOrderId(mesaBranchId, mesaTable, clientOrderId)
      saveMesaSession(mesaBranchId, mesaTable, { clientOrderId, mesaToken: res.mesaToken, numeroMesa: tableNumber })
      markPinVerified(tableNumber)
    } catch (e) {
      const msg = e instanceof MesaError ? mesaErrorMessage(e.code) : 'Não foi possível abrir a mesa. Chame o garçom.'
      setError(msg); toast.error(msg)
      setLoading(false)
      return
    }
    setLoading(false)
    handleSubmit(true)
  }

  const chamarGarcom = async () => {
    if (typeof tableNumber !== 'number') throw new Error('mesa sem número')
    await api.mesaChamarGarcom({
      branchId: mesaBranchId,
      clientOrderId: getMesaClientOrderId(mesaBranchId, mesaTable),
      numeroMesa: tableNumber,
      nomeCliente: clientName.trim() || undefined,
      motivo: 'Mesa já aberta - cliente quer pedir',
    })
  }

  /**
   * Lança os itens na loja. O `loteId` é o id deste checkout: reenviar depois de
   * timeout não duplica (a loja devolve o lote original). Se a resposta se perdeu,
   * pergunta à loja se o lote chegou antes de dar o pedido como falho.
   */
  const lancarNaMesa = async (loteId: string) => {
    const session = loadMesaSession(mesaBranchId, mesaTable)
    if (!session) throw new MesaError(401, 'TOKEN_MESA_INVALIDO')
    const body = {
      branchId: mesaBranchId,
      clientOrderId: session.clientOrderId,
      numeroMesa: session.numeroMesa,
      loteId,
      nomeCliente: clientName.trim() || undefined,
      itens: buildMesaItems(items, products),
    }
    try {
      return await api.mesaLancar(body, session.mesaToken)
    } catch (e) {
      if (e instanceof MesaError && e.isIndeterminate) {
        try {
          const r = await api.mesaLoteStatus(
            { branchId: mesaBranchId, clientOrderId: session.clientOrderId, loteId }, session.mesaToken)
          if (r.data?.resultado === 'CONFIRMADO') return { success: true }
        } catch { /* sem resposta de novo: segue o erro original */ }
      }
      throw e
    }
  }

  const handleSubmit = async (pinOk = false) => {
    // Nome e telefone são exigidos nos dois modos: a cozinha e o garçom
    // precisam saber de quem é o pedido, e a conta precisa de dono.
    if (requireId && !identity.ok) {
      const msg = identityMessage(identity.missing)
      setError(msg)
      toast.error(msg)
      return
    }
    if (mode !== 'mesa' && !clientName.trim()) {
      setError('Informe seu nome para ser chamado.')
      return
    }
    // CPF errado quebra a nota fiscal do lado do restaurante e o cliente só
    // descobre no caixa. Barrar aqui é mais barato para todos.
    if (cpf === 'invalid' || cpf === 'incomplete') {
      const msg = CPF_MESSAGE[cpf]!
      setError(msg)
      toast.error(msg)
      return
    }
    if (comandaEnabled && comandaRequired && !comanda.trim()) {
      setError(`Informe o número da sua ${comandaLabel.toLowerCase()}.`)
      return
    }
    if (pickPayment && !selectedPayment) {
      const msg = 'Escolha a forma de pagamento.'
      setError(msg)
      toast.error(msg)
      return
    }
    if (mesaErp && !(await prepareMesa())) return
    if (pinEnabled && !viaTotem && tableNumber === undefined) {
      setError('Aguarde um instante e confirme de novo.')
      return
    }
    if (pinRequired && !pinOk && !isPinStillValid(tableNumber as number)) {
      setPinOpen(true)
      return
    }
    // Vazio hoje em todas as branches: `buildOrderPayload` manda um marcador
    // no lugar, senão o validador do Laravel recusa o pedido (422)
    const simpleAuth = branch?.settingsWeb?.simpleAuth ?? ''

    setLoading(true); setError(null)

    /**
     * A loja ainda está aceitando pedido?
     *
     * O boot checou o horário quando o cliente abriu o cardápio — pode ter sido
     * há duas horas. Nesse meio a casa pode ter fechado, batido o horário do
     * período, ou o gerente pode ter pausado os pedidos. Sem reconsultar, o
     * pedido entra na cozinha depois de o fogão desligar, e ninguém avisa o
     * cliente que está esperando.
     *
     * **Falha de rede não bloqueia.** Se a consulta não responde, segue para o
     * POST: o backend é a autoridade final e vai recusar se for o caso. Travar o
     * pedido por um soluço de rede impediria venda legítima — e o cliente está de
     * pé no restaurante, com o pedido montado.
     */
    try {
      const fresh = await api.getBranch(params?.branchId ?? '')
      const raw = fresh.data?.[0] as Record<string, unknown> | undefined
      if (raw) {
        const freshBranch = raw as unknown as typeof branch
        const settings = (raw['settingsWeb'] ?? {}) as Record<string, unknown>

        // Interruptor de pânico da casa: pausa pedidos sem mexer em horário.
        // Ausente = aceitando, para branch que ainda não tem o campo.
        if (settings['acceptingOrders'] === false) {
          const msg = typeof settings['notAcceptingOrdersMessage'] === 'string'
            && (settings['notAcceptingOrdersMessage'] as string).trim()
            ? (settings['notAcceptingOrdersMessage'] as string)
            : 'A loja pausou os pedidos no momento. Chame um atendente.'
          setError(msg); toast.error(msg); setLoading(false)
          return
        }

        const closed = freshBranch ? checkBranchOpen(freshBranch, periods) : null
        if (closed) {
          const msg = closed === 'branchInactive'
            ? 'A loja não está aceitando pedidos agora.'
            : 'A loja fechou enquanto você montava o pedido. Chame um atendente.'
          setError(msg); toast.error(msg); setLoading(false)
          return
        }
      }
    } catch (e) {
      // Só registra: o POST adiante decide
      console.warn('[pedido] não foi possível reverificar se a loja está aberta', e)
    }

    // Confere o catálogo no instante do envio, inclusive itens já no carrinho.
    // O servidor repete a validação para evitar mudanças entre esta leitura e o POST.
    try {
      const branchId = params?.branchId ?? ''
      const [productsResponse, periodsResponse] = await Promise.all([
        api.getProducts(branchId), api.getPeriods(branchId),
      ])
      const freshProducts = new Map((productsResponse.data as Record<string, unknown>[])
        .map((product) => [String(product['_id']), product]))
      const freshPeriods = (periodsResponse.data as Record<string, unknown>[]).map(parsePeriod)
      for (const item of items) {
        const product = freshProducts.get(item.product._id)
        if (!product || product['active'] === false || isOutOfStock(product as { stock?: typeof item.product.stock })
          || (product['relatedPeriod'] && !checkValidPeriod(freshPeriods, String(product['relatedPeriod'])))) {
          throw new Error(`${item.product.name} não está disponível agora. Atualize o cardápio.`)
        }
        if (Math.abs(Number(product['price']) - item.product.price) > 0.009) {
          throw new Error(`O preço de ${item.product.name} mudou. Atualize o cardápio.`)
        }
        if (whereConsume === 'OutsideLocal') {
          const packagings = Array.isArray(product['packagings'])
            ? product['packagings'] as Array<{ price: number }> : []
          const currentPackagingPrice = product['chargesPackaging'] === true
            ? packagings.reduce((sum, packaging) => sum + Number(packaging.price), 0) : 0
          if (Math.abs(currentPackagingPrice - (item.assignedPackagingPrice ?? 0)) > 0.009) {
            throw new Error(`A embalagem de ${item.product.name} mudou. Atualize o cardápio.`)
          }
        }
        for (const complement of item.addedComplements.filter((c) => !c.isPackaging)) {
          const fresh = freshProducts.get(complement._id)
          if (!fresh || fresh['active'] === false || isOutOfStock(fresh as { stock?: typeof item.product.stock })
            || (fresh['relatedPeriod'] && !checkValidPeriod(freshPeriods, String(fresh['relatedPeriod'])))) {
            throw new Error(`${complement.name} não está disponível agora. Atualize o cardápio.`)
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error && e.message.includes('Atualize o cardápio')
        ? e.message : 'Não foi possível validar os produtos agora. Tente novamente.'
      setError(msg); toast.error(msg); setLoading(false)
      return
    }

    try {
      const payload = buildOrderPayload({
        branchId: params?.branchId ?? '',
        simpleAuth,
        consumptioncode, consumptionint,
        items, subtotal, total: finalTotal,
        client: { name: clientName, phone: clientPhone, cpf: clientCpf, email: clientEmail },
        askEmail,
        // Só vai no payload quando a branch usa comanda e o cliente informou
        comanda: comandaEnabled ? comanda : undefined,
        note: orderNote,
        mode, whereConsume,
        payVia: viaTotem ? 'totem' : 'local',
        payment: pickPayment ? selectedPayment : undefined,
        tmProduto,
        coupon: appliedCoupon,
        clientOrderId,
      })

      const historyItems = items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        amount: calcCartItemSubtotal(item),
        extras: item.addedComplements
          .filter((c) => !c.isPackaging)
          .map((c) => {
            const total = c.quantity * item.quantity
            return total > 1 ? `${total}× ${c.name}` : c.name
          }),
      }))

      if (viaTotem) {
        // Pré-pedido, não pedido: não vai para a cozinha até o totem cobrar
        const handoff = await api.postTotemHandoff(payload)
        const confirmedConsumptionCode = handoff.consumptioncode || handoff.code

        const orderTracking = readOrderTrackingConfig(branch?.settingsTotem)
        saveTotemHandoff({
          handoff,
          branchId: params?.branchId ?? '',
          consumptioncode: confirmedConsumptionCode,
          orderTrackingUrlTemplate: orderTracking.urlTemplate,
          trackingBranchIdDesk: orderTracking.branchIdDesk,
          trackingCompanyIdDesk: orderTracking.companyIdDesk,
          orderTrackingEnabled: orderTracking.enabled,
          total: handoff.total ?? finalTotal,
          items,
        })
        pushOrderHistory({
          at: new Date().toISOString(),
          branchId: params?.branchId ?? '',
          branchName: branch?.name,
          mode,
          table: params?.table,
          consumptioncode: confirmedConsumptionCode,
          consumptionint,
          comanda: comandaEnabled && comanda.trim() ? comanda.trim() : undefined,
          total: handoff.total ?? finalTotal,
          orderId: handoff.id,
          // Sem `status`: enviar ao totem não é pagar
          payment: { via: 'totem', handoffCode: handoff.code },
          items: historyItems,
        })

        clearCart()
        navigate('/totem', { replace: true })
        return
      }

      const result = mesaErp
        ? { ...(await lancarNaMesa(clientOrderId)), total: finalTotal }
        : await api.postOrder(payload)
      setNeedsRetry(false)

      // Registro local do cliente. Depois do POST e fora do caminho de erro:
      // falha ao gravar histórico não pode impedir a confirmação de um pedido
      // que já entrou na cozinha.
      pushOrderHistory({
        at: new Date().toISOString(),
        branchId: params?.branchId ?? '',
        branchName: branch?.name,
        mode,
        table: params?.table,
        consumptioncode,
        consumptionint,
        comanda: comandaEnabled && comanda.trim() ? comanda.trim() : undefined,
        total: typeof result?.total === 'number' ? result.total : finalTotal,
        orderId: (result as { _id?: string } | null)?._id,
        items: historyItems,
      })

      clearCart()
      navigate('/confirmacao', { state: { order: result, consumptioncode, consumptionint } })
    } catch (e) {
      // Mensagem específica por causa: CORS, simpleAuth recusado e validação
      // exigem consertos diferentes, e "tente novamente" não distingue nenhum
      if (e instanceof MesaError && e.code && (SESSION_ERROR_CODES.includes(e.code)
        || ['MESA_JA_PAGA', 'MESA_CANCELADA'].includes(e.code))) {
        clearMesaSession(mesaBranchId, mesaTable)
      }
      setNeedsRetry(e instanceof MesaError && e.isIndeterminate)
      const msg = e instanceof MesaError
        ? mesaErrorMessage(e.code, e.isOffline ? 'Não foi possível falar com o restaurante. Verifique a conexão.' : e.serverMessage)
        : e instanceof MesaItemError
          ? e.message
          : e instanceof OrderError
            ? e.clientMessage
            : 'Erro ao enviar pedido. Tente novamente.'
      setError(msg)
      toast.error(msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen"
      style={{ background: 'var(--bg-page)', paddingBottom: 'calc(210px + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header */}
      <div className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm" style={{ background: 'var(--bg-card)' }}>
        <HeaderButton icon="back" onClick={() => navigate(-1)} label="Voltar" emphasis />
        <div className="flex-1">
          <h1 className="text-base font-bold" style={{ color: 'var(--text-hi)' }}>Revisar pedido</h1>
          {consumptioncode && (
            <p className="text-xs" style={{ color: 'var(--text-lo)' }}>
              {mode === 'mesa' ? `Mesa ${consumptioncode}` : `Senha ${consumptioncode}`}
              {consumptionint ? ` · #${consumptionint}` : ''}
            </p>
          )}
        </div>
        <span className="text-sm" style={{ color: 'var(--text-lo)' }}>{itemCount()} itens</span>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* Itens */}
        <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 p-4 border-b last:border-0"
              style={{ borderColor: 'var(--divider)' }}>
              <ImageWithFallback src={item.product.image} alt={item.product.name}
                className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>{item.product.name}</p>
                {item.addedComplements.filter(c=>!c.isPackaging).length > 0 && (
                  <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-lo)' }}>
                    {/* Quantidade efetiva (por unidade × qtd do item) — é o que
                        o cliente recebe e o que a conta cobra */}
                    {item.addedComplements
                      .filter(c => !c.isPackaging)
                      .map(c => {
                        const total = c.quantity * item.quantity
                        return total > 1 ? `${total}× ${c.name}` : c.name
                      })
                      .join(', ')}
                  </p>
                )}
                {item.addedComplements.some(c=>c.isPackaging) && (
                  <p className="text-xs mt-0.5 text-emerald-600">
                    + Embalagem p/ levar · {formatCurrency(calcPackagingTotal([item]))}
                  </p>
                )}
                {item.note && <p className="text-xs mt-0.5 text-amber-600">Obs: {item.note}</p>}
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>{item.quantity}×</p>
              </div>
              <p className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-hi)' }}>
                {formatCurrency(calcCartItemSubtotal(item))}
              </p>
            </div>
          ))}
        </div>

        {/*
          Somente leitura de propósito.

          A modalidade define embalagem (grupos com autoAdd) e pode definir
          preço. Trocar aqui, com o carrinho montado, exigiria recalcular tudo
          o que já foi escolhido — e é justamente aí que aparecem itens com
          preço de uma modalidade e embalagem de outra. Para mudar, o cliente
          volta à tela inicial, onde o carrinho ainda está vazio.
        */}
        <div className="rounded-2xl p-4 border flex items-center gap-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-brand-light)' }}>
            <Icon name={whereConsume === 'OnLocal' ? 'menu' : 'takeaway'}
              size={16} color="var(--color-brand)" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Modalidade</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
              {whereConsume === 'OnLocal' ? 'Comer aqui' : 'Para levar'}
            </p>
          </div>
          {consumptionOptions.length > 1 && (
            <button
              onClick={handleChangeModality}
              className="text-xs font-semibold px-3 py-2 rounded-lg border flex-shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--color-brand)' }}
            >
              Trocar
            </button>
          )}
        </div>

        {/* A unidade libera o campo; a API valida o código digitado. */}
        <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', opacity: COUPONS_ENABLED ? 1 : 0.55 }}>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-hi)' }}>Cupom de desconto</p>
          <div className="flex gap-2">
            <input type="text"
              placeholder={COUPONS_ENABLED ? 'Código do cupom' : 'Indisponível no momento'}
              disabled={!COUPONS_ENABLED || couponLoading}
              value={couponInput} onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
              className="flex-1 text-sm rounded-xl px-3 py-2.5 outline-none uppercase disabled:cursor-not-allowed"
              style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }} />
            <button onClick={handleApplyCoupon}
              disabled={!COUPONS_ENABLED || couponLoading}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:cursor-not-allowed"
              style={{ backgroundColor: !COUPONS_ENABLED ? 'var(--text-lo)' : appliedCoupon ? '#6b7280' : 'var(--color-brand)' }}>
              {couponLoading ? 'Validando…' : appliedCoupon ? 'Remover' : 'Aplicar'}
            </button>
          </div>
          {!COUPONS_ENABLED && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-lo)' }}>
              Cupons estão desativados para esta unidade.
            </p>
          )}
          {COUPONS_ENABLED && couponError && <p className="text-xs text-red-500 mt-1.5">{couponError}</p>}
          {COUPONS_ENABLED && appliedCoupon && (
            <p className="text-xs text-emerald-600 mt-1.5 font-medium">
              ✓ {appliedCoupon.title} — desconto de {formatCurrency(subtotal - finalTotal)} aplicado
            </p>
          )}
        </div>

        {/* Obs geral */}
        <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-hi)' }}>
            Observação geral <span className="font-normal" style={{ color: 'var(--text-lo)' }}>(opcional)</span>
          </label>
          <textarea value={orderNote} onChange={(e) => setOrderNote(e.target.value)}
            placeholder="Ex: alergia a amendoim..." rows={2}
            className="w-full text-sm resize-none outline-none placeholder-gray-300"
            style={{ color: 'var(--text-hi)', background: 'transparent' }} />
        </div>

        {/* Comanda (mesa com comanda ligada) */}
        {comandaEnabled && (
          <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text-hi)' }}>
              {comandaLabel} {comandaRequired
                ? <span className="text-red-500">*</span>
                : <span className="font-normal" style={{ color: 'var(--text-lo)' }}>(opcional)</span>}
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-lo)' }}>
              Informe o número da sua {comandaLabel.toLowerCase()} para seus pedidos
              ficarem separados dos das outras pessoas da mesa.
            </p>
            <input
              type="text" inputMode="numeric"
              placeholder={`Número da ${comandaLabel.toLowerCase()}`}
              value={comanda}
              onChange={(e) => setComanda(e.target.value)}
              className="w-full text-sm rounded-xl px-3 py-3 outline-none"
              style={{ background: 'var(--bg-input)', color: 'var(--text-hi)', border: '1px solid var(--border)' }}
            />
          </div>
        )}

        {/* Identificação */}
        <div className="rounded-2xl p-4 border flex flex-col gap-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
            Identificação {requireId
              ? <span style={{ color: '#dc2626' }}>*</span>
              : <span className="font-normal" style={{ color: 'var(--text-lo)' }}>(opcional)</span>}
          </p>
          {requireId && (
            <p className="text-xs -mt-1" style={{ color: 'var(--text-lo)' }}>
              Nome e telefone são necessários para o pedido chegar até você.
            </p>
          )}
          {comandaEnabled && (
            /* A comanda já identifica a conta; o nome aqui é só para o pedido
               aparecer com dono na tela da conta e o garçom saber de quem é. */
            <p className="text-xs -mt-1" style={{ color: 'var(--text-lo)' }}>
              A {comandaLabel.toLowerCase()} já separa a sua conta. O nome é só para
              seus pedidos aparecerem identificados.
            </p>
          )}
          <GoogleSignInButton />

          {FIELDS.map((field) => (
            <div key={field.key}>
              <div className="relative">
                <input
                  type={field.type}
                  inputMode={field.inputMode}
                  autoComplete={field.autoComplete}
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="w-full text-sm rounded-xl px-3 py-3 outline-none"
                  style={{
                    background: 'var(--bg-input)',
                    color: 'var(--text-hi)',
                    border: `1px solid ${field.error ? '#dc2626' : 'var(--border)'}`,
                    paddingRight: field.valid ? 38 : undefined,
                  }}
                />
                {field.valid && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--color-brand)' }}>
                    <Icon name="check" size={13} />
                  </span>
                )}
              </div>
              {field.error && (
                <p className="text-xs mt-1" style={{ color: '#dc2626' }}>{field.error}</p>
              )}
            </div>
          ))}
          {mode !== 'mesa' && (
            <p className="text-xs text-amber-600">Seu nome será chamado quando o pedido estiver pronto.</p>
          )}
        </div>

        {/* Fechar conta — as formas de pagamento moram aqui; ainda desabilitado */}
        {pickPayment && (
          <div role="radiogroup" aria-label="Forma de pagamento" className="rounded-2xl p-4 border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-hi)' }}>Forma de pagamento</p>
            <div className="flex flex-wrap gap-2">
              {methodOptions.map((m) => {
                const selected = m.key === paymentKey
                return (
                  <button key={m.key} type="button" role="radio" aria-checked={selected}
                    onClick={() => setPaymentKey(m.key)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold border active:scale-[0.98] transition-transform"
                    style={{
                      background: selected ? 'var(--color-brand)' : 'var(--bg-card)',
                      color: selected ? '#fff' : 'var(--text-hi)',
                      borderColor: selected ? 'var(--color-brand)' : 'var(--border)',
                    }}>
                    {m.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-lo)' }}>
              O pagamento é feito no balcão, na retirada do pedido.
            </p>
          </div>
        )}

        {!pickPayment && closeBillLabels.length > 0 && !viaTotem && (
          <button type="button" disabled aria-disabled="true"
            className="w-full text-left rounded-2xl p-4 border opacity-60 cursor-not-allowed"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <span className="block text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
              Fechar conta
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-lo)' }}>em breve</span>
            </span>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
              {closeBillLabels.join(' · ')}
            </span>
          </button>
        )}

        {viaTotem && (
          <div className="rounded-2xl p-4 border flex items-start gap-3"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--color-brand)' }}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-brand)' }}>
              <Icon name="qrcode" size={16} color="#fff" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: 'var(--text-lo)' }}>Pagamento</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>Pagar no totem</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-lo)' }}>
                Vamos gerar um QR Code: mostre no totem e pague por lá. O pedido só
                vai para a cozinha depois do pagamento.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Barra de total — encostada na TabBar, não no fundo da tela.
          Sem esse deslocamento a aba cobria o botão de enviar o pedido. */}
      <div className="fixed left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-3xl border-t px-4 py-3 z-20"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
          bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))',
        }}>
        {appliedCoupon && (
          <div className="flex justify-between text-sm mb-1">
            <span style={{ color: 'var(--text-lo)' }}>Subtotal</span>
            <span style={{ color: 'var(--text-lo)' }}>{formatCurrency(subtotal)}</span>
          </div>
        )}
        {appliedCoupon && (
          <div className="flex justify-between text-sm mb-1 text-emerald-600">
            <span>Desconto ({appliedCoupon.title})</span>
            <span>−{formatCurrency(subtotal - finalTotal)}</span>
          </div>
        )}
        {packagingTotal > 0 && (
          <div className="flex justify-between text-sm mb-1">
            <span style={{ color: 'var(--text-lo)' }}>Embalagem (incluída no total)</span>
            <span style={{ color: 'var(--text-lo)' }}>{formatCurrency(packagingTotal)}</span>
          </div>
        )}
        <div className="flex justify-between items-center mb-2.5">
          <span className="font-semibold" style={{ color: 'var(--text-hi)' }}>Total</span>
          <span className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>{formatCurrency(finalTotal)}</span>
        </div>
        <button onClick={() => handleSubmit()} disabled={loading}
          className="w-full py-4 rounded-xl text-white font-semibold text-base disabled:opacity-60 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          {loading
            ? (viaTotem ? 'Gerando QR Code...' : 'Enviando...')
            : needsRetry ? 'Tentar novamente'
            : viaTotem ? 'Gerar QR Code para o totem'
            : mode === 'mesa' ? 'Fazer pedido na mesa'
              : mode === 'delivery' ? 'Fazer pedido' : 'Fazer pedido no balcão'}
        </button>
      </div>

      {pinRequired && (
        <PinModal
          open={pinOpen}
          tableNumber={tableNumber as number}
          openedAt={openedAt}
          onCancel={() => setPinOpen(false)}
          onConfirm={() => {
            markPinVerified(tableNumber as number)
            setPinOpen(false)
            handleSubmit(true)
          }}
        />
      )}

      {mesaErp && typeof tableNumber === 'number' && (
        <PinModal
          open={erpPinOpen}
          tableNumber={tableNumber}
          openedAt={openedAt}
          onCancel={() => setErpPinOpen(false)}
          onConfirm={abrirMesa}
        />
      )}

      <MesaBlockedModal
        open={mesaBlocked !== null}
        reason={mesaBlocked ?? 'ocupada'}
        tableLabel={tableLabel(params?.table)}
        onCallWaiter={chamarGarcom}
        onClose={() => setMesaBlocked(null)}
      />

      <ConfirmModal
        open={confirmModality}
        destructive
        title="Trocar a modalidade?"
        message="Comer aqui e para levar têm embalagem e preços diferentes. Seu carrinho será esvaziado e você volta à escolha inicial."
        confirmLabel="Sim, trocar"
        cancelLabel="Manter como está"
        onConfirm={doChangeModality}
        onCancel={() => setConfirmModality(false)}
      />
    </div>
  )
}
