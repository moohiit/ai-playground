import { ProjectCard } from "@/components/shared/ProjectCard";
import { projects } from "@/lib/projects";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
      <section className="pt-8">
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          A playground for{" "}
          <span className="text-brand-500">Generative AI</span> projects.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400">
          A growing collection of small, focused AI tools — each one built
          end-to-end to demonstrate practical GenAI engineering: prompt design,
          structured output, evals, rate limiting, and clean APIs. Pick a
          project to try, or check back as new ones land.
        </p>
      </section>

      <section>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Projects</h2>
          <span className="text-xs text-zinc-500">
            {projects.filter((p) => p.status === "live").length} live ·{" "}
            {projects.filter((p) => p.status === "coming-soon").length} coming
            soon
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.href} {...project} />
          ))}
        </div>
      </section>
    </div>
  );
}
