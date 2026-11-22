import { MenuConta } from '@/components/conta/MenuConta';

export default function LayoutConta({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-loja grid gap-6 py-6 lg:grid-cols-[240px_1fr]">
      <aside className="lg:sticky lg:top-40 lg:self-start"><MenuConta /></aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
