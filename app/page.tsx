import Link from "next/link";
import { ProjectCard } from "@/components/shared/ProjectCard";
import { projects } from "@/lib/projects";

export default function HomePage() {
  const liveCount = projects.filter((p) => p.status === "live").length;
  const soonCount = projects.filter((p) => p.status === "coming-soon").length;

  return (
    <div className="flex flex-col gap-20">
      <section className="relative isolate overflow-hidden pt-10 sm:pt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid bg-radial-fade" />
        <div className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl animate-blob" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 -z-10 h-[360px] w-[360px] rounded-full bg-fuchsia-500/15 blur-3xl animate-blob [animation-delay:-4s]" />
        <div className="pointer-events-none absolute -right-24 top-10 -z-10 h-[320px] w-[320px] rounded-full bg-cyan-500/10 blur-3xl animate-blob [animation-delay:-8s]" />

        <div className="mx-auto max-w-3xl text-center animate-fade-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 animate-pulse-ring" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Powered by Gemini · Free‑tier friendly
          </div>

          <h1 className="text-balance text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            A playground for{" "}
            <span className="text-gradient-brand">Generative AI</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
            A growing collection of small, focused AI tools — built end‑to‑end
            to demonstrate practical GenAI engineering: prompt design,
            structured output, evals, rate limiting, and clean APIs.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="#projects"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03]"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              Explore Projects
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
            <a
              href="https://github.com/moohiit/ai-playground"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-2.5 text-sm font-medium text-zinc-300 backdrop-blur transition-colors hover:border-zinc-600 hover:text-white"
            >
              View Source
            </a>
          </div>

          <div className="mx-auto mt-14 grid max-w-xl grid-cols-3 gap-4">
            {[
              { label: "Live Projects", value: liveCount },
              { label: "In the Works", value: soonCount },
              { label: "Open Source", value: "100%" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="animate-float-slow rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-4 backdrop-blur"
                style={{ animationDelay: `${i * 0.6}s` }}
              >
                <div className="text-2xl font-bold text-gradient-brand">
                  {stat.value}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="projects" className="scroll-mt-24">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.2em] text-brand-500/90">
              The Lab
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Projects
            </h2>
          </div>
          <span className="hidden rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs text-zinc-400 backdrop-blur sm:inline-flex">
            {liveCount} live · {soonCount} coming soon
          </span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, i) => (
            <div
              key={project.href}
              className="animate-fade-up"
              style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            >
              <ProjectCard {...project} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
