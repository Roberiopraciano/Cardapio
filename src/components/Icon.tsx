import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faUtensils, faCartShopping, faReceipt, faUser, faBellConcierge,
  faMagnifyingGlass, faXmark, faArrowLeft, faArrowRotateRight,
  faBagShopping, faQrcode, faCamera, faWifi, faChair, faStar,
  faCircleCheck, faCircleExclamation, faFaceFrown, faChevronDown,
  faMinus, faPlus, faCheck, faClock, faTag, faMobileScreenButton,
  faUserTie, faHandsPraying, faFire, faTruckFast, faLanguage,
  faTrash, faPen, faCircleInfo, faTriangleExclamation, faHourglassHalf,
} from '@fortawesome/free-solid-svg-icons'

/**
 * Ícones do app.
 *
 * Nomes semânticos em vez de importar o FontAwesome direto em cada tela: assim
 * trocar o ícone de "conta" acontece num lugar só, e nenhuma tela precisa saber
 * que a biblioteca é o FontAwesome.
 */
export const ICONS = {
  menu: faUtensils,
  cart: faCartShopping,
  bill: faReceipt,
  profile: faUser,
  waiter: faBellConcierge,
  search: faMagnifyingGlass,
  close: faXmark,
  back: faArrowLeft,
  refresh: faArrowRotateRight,
  takeaway: faBagShopping,
  qrcode: faQrcode,
  camera: faCamera,
  offline: faWifi,
  table: faChair,
  star: faStar,
  success: faCircleCheck,
  error: faCircleExclamation,
  sad: faFaceFrown,
  chevron: faChevronDown,
  minus: faMinus,
  plus: faPlus,
  check: faCheck,
  clock: faClock,
  tag: faTag,
  phone: faMobileScreenButton,
  staff: faUserTie,
  thanks: faHandsPraying,
  cooking: faFire,
  delivering: faTruckFast,
  language: faLanguage,
  trash: faTrash,
  edit: faPen,
  info: faCircleInfo,
  warning: faTriangleExclamation,
  waiting: faHourglassHalf,
} as const

export type IconName = keyof typeof ICONS

interface Props {
  name: IconName
  className?: string
  /** Tamanho em px. Sem valor, herda o font-size do elemento pai. */
  size?: number
  color?: string
  spin?: boolean
  title?: string
  /** Estilo extra — usado para rotacionar o chevron de acordeão. */
  style?: React.CSSProperties
}

export default function Icon({ name, className, size, color, spin, title, style }: Props) {
  const def: IconDefinition = ICONS[name]
  return (
    <FontAwesomeIcon
      icon={def}
      className={className}
      spin={spin}
      title={title}
      style={{ fontSize: size, color, width: size ? size : undefined, ...style }}
      aria-hidden={title ? undefined : true}
    />
  )
}
