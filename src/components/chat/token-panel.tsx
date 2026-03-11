import type { TokenUsageStat } from './chat-types'
import { useEffect, useRef } from 'react'
import { cn } from '@/src/utils'

interface TokenPanelProps {
  isVisible: boolean
  onToggle: () => void
  tokenUsageStats: TokenUsageStat[]
  formatDuration: (durationMs: number) => string
  formatNullableDuration: (durationMs: number | null) => string
  formatNullableNumber: (value: number | null, digits?: number) => string
}

const TokenPanel: React.FC<TokenPanelProps> = ({
  isVisible,
  onToggle,
  tokenUsageStats,
  formatDuration,
  formatNullableDuration,
  formatNullableNumber,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollContainerRef.current && tokenUsageStats.length > 0) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [tokenUsageStats])
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-4 top-24 z-40 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-lg shadow-slate-200/80 backdrop-blur hover:bg-slate-50"
        aria-label={isVisible ? '收起 Token 面板' : '展开 Token 面板'}
        tabIndex={0}
      >
        {isVisible ? '收起 Token' : 'Token 图表'}
      </button>

      <aside
        className={cn(
          'fixed right-4 top-36 z-40 h-[60vh] w-80 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-200/80 backdrop-blur transition-transform duration-300',
          isVisible ? 'translate-x-0' : 'translate-x-[120%]',
        )}
        aria-label="Token 消耗图表"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">Token 消耗图表</p>
        </div>

        <div ref={scrollContainerRef} className="h-[calc(100%-32px)] overflow-y-auto pr-1">
          {tokenUsageStats.length > 0
            ? (
                <div className="space-y-2">
                  {tokenUsageStats.map((item, index) => (
                    <div key={item.id} className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>
                          {`第 ${index + 1} 轮${item.isAborted ? '（已终止）' : ''}`}
                        </span>
                        <span>{`${item.total} tokens`}</span>
                      </div>
                      <p className="text-[11px] leading-5 text-slate-500">
                        {`首 token: ${formatNullableDuration(item.firstTokenLatencyMs)} | 总耗时: ${formatDuration(item.generationDurationMs)} | 平均: ${formatNullableDuration(item.msPerToken)} / token | 速度: ${formatNullableNumber(item.tokensPerSecond)} tok/s`}
                      </p>
                    </div>
                  ))}
                </div>
              )
            : null}
        </div>
      </aside>
    </>
  )
}

export { TokenPanel }
