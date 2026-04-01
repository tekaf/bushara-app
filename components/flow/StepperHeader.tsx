'use client'

import { Check, CreditCard } from 'lucide-react'

type StepItem = {
  id: number
  label: string
}

export default function StepperHeader({
  steps,
  activeStep,
  onStepClick,
  progressHint,
}: {
  steps: StepItem[]
  activeStep: number
  onStepClick?: (stepId: number) => void
  progressHint?: string
}) {
  const totalSteps = steps.length
  const normalizedActiveStep = Math.max(1, Math.min(totalSteps, activeStep))
  const activeIndex = steps.findIndex((step) => step.id === normalizedActiveStep)
  const shownIndex = activeIndex >= 0 ? activeIndex + 1 : normalizedActiveStep

  return (
    <div className="rounded-3xl bg-white p-4 md:p-6 shadow-sm border border-gray-100 mb-6 overflow-x-auto">
      <div className="mb-4 flex items-center justify-between gap-3 text-xs md:text-sm">
        <p className="font-semibold text-primary">
          الخطوة {shownIndex} من {totalSteps}
        </p>
        <p className="text-muted">{progressHint || (shownIndex >= totalSteps - 1 ? 'باقي خطوة واحدة لإكمال دعوتك ✨' : 'أنت تسير بشكل ممتاز ✨')}</p>
      </div>
      <div className="mb-5 h-1.5 rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${(shownIndex / totalSteps) * 100}%` }}
        />
      </div>
      <div className="flex min-w-[760px] items-start gap-3">
        {steps.map((step, idx) => {
          const isActive = normalizedActiveStep === step.id
          const isCompleted = normalizedActiveStep > step.id
          const isLastStep = idx === steps.length - 1
          const isClickable = Boolean(onStepClick && isCompleted)
          const displayLabel = isLastStep && step.label === 'الدفع' ? 'الدفع والتأكيد' : step.label

          const nodeClass = isCompleted
            ? 'bg-primary/10 text-primary border-primary/20'
            : isActive
            ? 'bg-primary text-white border-primary shadow-[0_8px_24px_rgba(95,61,196,0.28)] scale-105'
            : 'bg-gray-50 text-gray-400 border-gray-200'

          const labelClass = isActive
            ? 'text-primary font-bold'
            : isCompleted
            ? 'text-gray-700 font-semibold'
            : 'text-gray-400 font-medium'

          const connectorClass = isCompleted ? 'bg-primary/60' : 'bg-gray-200'

          const content = (
            <>
              <div
                className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold transition-all duration-200 ${nodeClass}`}
              >
                {isCompleted ? <Check size={16} /> : isLastStep ? <CreditCard size={16} /> : step.id}
              </div>
              <div className="mr-3 ml-2">
                <div className={`text-sm transition-colors ${labelClass}`}>{displayLabel}</div>
              </div>
            </>
          )

          return (
            <div key={step.id} className="flex items-center flex-1">
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(step.id)}
                  className="flex items-center text-right rounded-xl px-1 py-1 hover:bg-gray-50 transition-colors"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center px-1 py-1">{content}</div>
              )}
              {idx !== steps.length - 1 && (
                <div className={`flex-1 h-1 rounded-full ${connectorClass}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
