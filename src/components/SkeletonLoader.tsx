/** Skeletons com shimmer para o estado de loading */

export function CategoryTabsSkeleton() {
  return (
    <div className="flex gap-2 px-4 pb-3 overflow-hidden">
      {[80, 64, 72, 56, 68].map((w, i) => (
        /* h-8 acompanha a altura real do pill com a foto da categoria dentro —
           com h-7 o header pulava quando as categorias carregavam */
        <div key={i} className="skeleton flex-shrink-0 h-8 rounded-full" style={{ width: w }} />
      ))}
    </div>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-c" style={{ background: 'var(--bg-card)' }}>
      <div className="skeleton aspect-square w-full" />
      <div className="p-3 flex flex-col gap-2">
        <div className="skeleton h-3.5 rounded w-4/5" />
        <div className="skeleton h-3 rounded w-3/5" />
        <div className="skeleton h-4 rounded w-2/5 mt-1" />
      </div>
    </div>
  )
}

export function MenuSkeleton() {
  return (
    <div className="px-4 pt-4 flex flex-col gap-8">
      {[1, 2].map((cat) => (
        <div key={cat}>
          <div className="skeleton h-5 rounded w-32 mb-3" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((p) => <ProductCardSkeleton key={p} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
