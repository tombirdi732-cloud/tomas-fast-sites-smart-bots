import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

const NAV = [
  { id: "about", label: "Обо мне" },
  { id: "services", label: "Услуги" },
  { id: "advantages", label: "Преимущества" },
  { id: "process", label: "Работа" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Контакты" },
];

const SERVICES = [
  { title: "Сайты-визитки", desc: "Аккуратные страницы для личного бренда и небольших проектов.", icon: "01" },
  { title: "Лендинги", desc: "Продающие одностраничники с фокусом на заявку.", icon: "02" },
  { title: "Telegram-боты", desc: "Боты для продаж, поддержки и автоматизации задач.", icon: "03" },
  { title: "Discord-боты", desc: "Модерация, роли, мини-игры и интеграции под сервер.", icon: "04" },
  { title: "Скрипты и автоматизация", desc: "Закрываю рутину — Python, Lua и интеграции API.", icon: "05" },
  { title: "Парсеры", desc: "Сбор данных с сайтов и выгрузка в нужном формате.", icon: "06" },
  { title: "Доработка проектов", desc: "Дополняю и чиню готовые сайты и ботов.", icon: "07" },
  { title: "Техническая поддержка", desc: "На связи после запуска — правки и обновления.", icon: "08" },
];

const ADVANTAGES = [
  { title: "Быстрый старт", desc: "Беру задачу в работу сразу после короткого обсуждения." },
  { title: "Работа под ключ", desc: "От идеи до запуска — без необходимости что-то доделывать." },
  { title: "Понятное общение", desc: "Простым языком, без лишних терминов и воды." },
  { title: "Аккуратная реализация", desc: "Чистый код, понятная структура и удобная поддержка." },
  { title: "Под задачу клиента", desc: "Каждое решение собирается под конкретную цель." },
  { title: "Поддержка и доработки", desc: "Помогаю проекту жить и развиваться после сдачи." },
];

const PROCESS = [
  "Обсуждение задачи",
  "Уточнение деталей",
  "Разработка решения",
  "Проверка и согласование",
  "Сдача проекта",
  "Правки при необходимости",
];

const FAQ = [
  { q: "Какие проекты ты делаешь?", a: "Сайты-визитки, лендинги, Telegram и Discord-ботов, скрипты, парсеры и автоматизацию." },
  { q: "Можно ли заказать только бота или только сайт?", a: "Да. Берусь как за полные проекты, так и за отдельные задачи." },
  { q: "Работаешь ли с доработкой готовых проектов?", a: "Да, дорабатываю и поддерживаю существующие сайты и боты." },
  { q: "Какие технологии используешь?", a: "Python, Java, CSS, Lua и сопутствующие инструменты под задачу." },
  { q: "Можно ли обратиться без готового ТЗ?", a: "Конечно. Помогу сформулировать задачу и предложу подходящее решение." },
  { q: "Есть ли связь во время работы?", a: "Да, держу клиента в курсе на каждом этапе разработки." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <About />
        <Services />
        <Advantages />
        <Process />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <span className="inline-block size-2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
          Tomas<span className="text-primary">.</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="transition-colors hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <a
          href="#contact"
          className="hidden rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 md:inline-block"
        >
          Связаться
        </a>
        <button
          aria-label="Меню"
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-md border border-border md:hidden"
        >
          <span className="relative block h-3 w-4">
            <span className={`absolute inset-x-0 top-0 h-0.5 bg-foreground transition-transform ${open ? "translate-y-1.5 rotate-45" : ""}`} />
            <span className={`absolute inset-x-0 bottom-0 h-0.5 bg-foreground transition-transform ${open ? "-translate-y-1 -rotate-45" : ""}`} />
          </span>
        </button>
      </div>
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground"
            >
              Связаться
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "var(--gradient-radial)" }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="container-page py-20 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
            Открыт для новых заказов
          </div>
          <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-5xl md:text-6xl lg:text-7xl">
            Tomas — разработка{" "}
            <span className="text-gradient">сайтов и ботов</span>{" "}
            под ключ
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
            Программист Python, Java, CSS, Lua. Создаю сайты, ботов и автоматизацию быстро, понятно и без лишней сложности.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#contact"
              className="w-full rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 sm:w-auto glow"
            >
              Связаться
            </a>
            <a
              href="#services"
              className="w-full rounded-full border border-border bg-surface/60 px-7 py-3.5 text-sm font-semibold text-foreground transition hover:bg-surface sm:w-auto"
            >
              Посмотреть услуги
            </a>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
            {["Python", "Java", "CSS", "Lua"].map((t) => (
              <span key={t} className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-primary" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHead({ tag, title, sub }: { tag: string; title: string; sub?: string }) {
  return (
    <div className="mb-12 max-w-2xl">
      <div className="mb-3 font-mono text-xs uppercase tracking-widest text-primary">{tag}</div>
      <h2 className="text-3xl font-bold md:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-muted-foreground">{sub}</p>}
    </div>
  );
}

function About() {
  return (
    <section id="about" className="border-b border-border py-20 md:py-28">
      <div className="container-page grid gap-10 md:grid-cols-[1fr_1.4fr] md:items-start">
        <SectionHead tag="// 01 — обо мне" title="Привет, я Tomas" />
        <div className="space-y-5 text-lg leading-relaxed text-muted-foreground">
          <p>
            Занимаюсь разработкой <span className="text-foreground">сайтов, ботов и автоматизации</span> под разные задачи. Работаю с Python, Java, CSS и Lua.
          </p>
          <p>
            Делаю проекты под ключ — с понятной логикой, быстрым запуском и удобной связью с клиентом. Без перегруза терминами и лишних шагов.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {["Python", "Java", "CSS", "Lua", "Telegram API", "Discord API", "Парсинг", "Автоматизация"].map((t) => (
              <span key={t} className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section id="services" className="border-b border-border py-20 md:py-28">
      <div className="container-page">
        <SectionHead tag="// 02 — услуги" title="Что я делаю" sub="Берусь как за целые проекты, так и за отдельные задачи." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <div
              key={s.title}
              className="group surface-card p-6 transition-all hover:-translate-y-1 hover:border-primary/50"
            >
              <div className="mb-5 font-mono text-xs text-primary">{s.icon}</div>
              <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Advantages() {
  return (
    <section id="advantages" className="border-b border-border py-20 md:py-28">
      <div className="container-page">
        <SectionHead tag="// 03 — преимущества" title="Почему со мной удобно" />
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {ADVANTAGES.map((a) => (
            <div key={a.title} className="bg-background p-7 transition-colors hover:bg-surface">
              <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="mb-2 font-semibold">{a.title}</h3>
              <p className="text-sm text-muted-foreground">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section id="process" className="border-b border-border py-20 md:py-28">
      <div className="container-page">
        <SectionHead tag="// 04 — как проходит работа" title="Простой и предсказуемый процесс" />
        <ol className="relative space-y-4">
          {PROCESS.map((step, i) => (
            <li
              key={step}
              className="surface-card flex items-center gap-5 p-5 transition-colors hover:border-primary/40"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-semibold text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-base font-medium md:text-lg">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="border-b border-border py-20 md:py-28">
      <div className="container-page max-w-3xl">
        <SectionHead tag="// 05 — FAQ" title="Частые вопросы" />
        <div className="space-y-3">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="surface-card overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <span className="font-medium">{item.q}</span>
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-primary transition-transform ${isOpen ? "rotate-45" : ""}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="py-20 md:py-28">
      <div className="container-page">
        <SectionHead tag="// 06 — контакты" title="Напиши — обсудим задачу" sub="Выбери удобный способ связи, я отвечу и предложу решение." />
        <div className="mx-auto max-w-xl space-y-3">
          <ContactLink href="https://t.me/Tombirdi" label="Telegram" value="@Tombirdi" />
          <ContactLink href="mailto:tombirdi732@gmail.com" label="Email" value="tombirdi732@gmail.com" />
        </div>
      </div>
    </section>
  );
}

function ContactLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="surface-card flex items-center justify-between p-5 transition-colors hover:border-primary/50"
    >
      <div>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 font-medium">{value}</div>
      </div>
      <span className="text-primary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </span>
    </a>
  );
}


function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="container-page flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground md:flex-row">
        <div className="font-display font-semibold text-foreground">
          Tomas<span className="text-primary">.</span>
        </div>
        <div className="font-mono text-xs">© {new Date().getFullYear()} — разработка под ключ</div>
      </div>
    </footer>
  );
}
