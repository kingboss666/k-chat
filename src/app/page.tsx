import Chat from '@/src/components/Chat'

const HomePage: React.FC = () => {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <h1 className="mb-4 text-3xl font-semibold tracking-tight text-slate-900">K Chat</h1>
      <p className="mb-6 text-sm text-slate-600">
        基于 Next.js Route Handlers 的最小可运行聊天示例
      </p>
      <Chat />
    </main>
  )
}

export default HomePage
