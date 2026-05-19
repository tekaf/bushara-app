'use client'

export type ExecutedInvitationSample = {
  id: string
  title: string
  imageUrl: string
}

type Props = {
  samples: ExecutedInvitationSample[]
}

export default function ExamplesStudioMarquee({ samples }: Props) {
  if (!samples.length) {
    return (
      <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-5 text-center text-sm text-[#7B8194] shadow-[0_14px_34px_rgba(31,36,51,0.05)] backdrop-blur-2xl">
        لا توجد نماذج منشورة حاليًا
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[rgba(150,160,190,0.18)] bg-white/72 p-4 shadow-[0_24px_80px_rgba(31,36,51,0.08)] backdrop-blur-2xl md:p-5">
      <div className="flex flex-wrap gap-4">
        {samples.map((sample) => (
          <img
            key={sample.id}
            src={sample.imageUrl}
            alt={sample.title || 'sample'}
            style={{
              width: 220,
              height: 420,
              objectFit: 'cover',
              borderRadius: 24,
            }}
          />
        ))}
      </div>
    </div>
  )
}
