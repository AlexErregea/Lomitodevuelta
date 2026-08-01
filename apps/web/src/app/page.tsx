import Link from 'next/link';
import { AMBAR, AMBAR_CLARO, Brand, Logo } from '@/components/brand';
import { content } from '@/content/es-MX';

// ============================================================================
// Landing (puerta de entrada, ruta /). Server Component estático: rápido y
// bueno para SEO/preview. Es la reconstrucción fiel en JSX+Tailwind del diseño
// del fundador (Landing/index.html); el copy vive en content.landing (regla
// i18n). Los CTAs de reporte enrutan a los dos flujos: /perdi y /encontre.
// ============================================================================

const t = content.landing;

export default function LandingPage() {
  return (
    <div className="bg-crema font-sans text-tinta">
      <Nav />
      <Hero />
      <ValueProps />
      <CercaDeTi />
      <ComoFunciona />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <div className="border-b border-borde bg-crema">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-[14px]">
        <div className="flex items-center gap-[10px]">
          <Logo size={34} />
          <Brand />
        </div>
        <div className="flex flex-wrap items-center gap-[18px]">
          <a href="#como" className="text-sm font-semibold text-[#6b5a48] hover:text-ambar-texto">
            {t.nav.como}
          </a>
          <a href="#cerca" className="text-sm font-semibold text-[#6b5a48] hover:text-ambar-texto">
            {t.nav.cerca}
          </a>
          <a
            href="#reportar"
            className="rounded-[10px] bg-ambar px-[18px] py-[10px] text-sm font-bold text-white hover:bg-ambar-oscuro"
          >
            {t.nav.cta}
          </a>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden bg-crema">
      {/* huellas decorativas */}
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute left-[6%] top-[16%] h-[19px] w-[26px] rounded-[48%_52%_55%_45%] bg-tinta opacity-[.05]" />
        <span className="absolute left-[22%] top-[70%] h-[14px] w-[18px] rounded-[52%_48%_45%_55%] bg-tinta opacity-[.05]" />
        <span className="absolute right-[44%] top-[10%] h-[11px] w-[14px] rounded-full bg-tinta opacity-[.06]" />
        <span className="absolute bottom-[12%] right-[6%] h-[16px] w-[22px] rounded-[55%_45%_50%_50%] bg-tinta opacity-[.04]" />
      </div>

      <div className="relative mx-auto flex max-w-[1120px] flex-wrap items-center gap-[clamp(28px,5vw,64px)] px-6 py-[clamp(36px,6vw,72px)]">
        <div className="min-w-[300px] flex-[1_1_340px]">
          <div className="mb-4 text-[13px] font-bold tracking-[.05em] text-[#8a6a3f]">{t.hero.badge}</div>
          <h1 className="mb-[18px] font-display text-[clamp(34px,5.2vw,54px)] font-bold leading-[1.08] tracking-[-.02em]">
            {t.hero.titleA}
            <span className="text-ambar">{t.hero.titleAccent}</span>
          </h1>
          <p className="mb-[26px] max-w-[520px] text-[clamp(15px,1.5vw,18px)] leading-[1.6] text-[#6b5a48]">
            {t.hero.subtitle}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/perdi"
              className="rounded-[12px] bg-ambar px-[26px] py-[15px] text-base font-bold text-white hover:bg-ambar-oscuro"
            >
              {t.hero.ctaLost}
            </Link>
            <Link
              href="/encontre"
              className="rounded-[12px] border-[1.5px] border-[#cdbb9d] px-[26px] py-[14px] text-base font-bold text-tinta hover:border-ambar"
            >
              {t.hero.ctaFound}
            </Link>
          </div>
          <div className="mt-[14px] text-[13px] text-[#9a876f]">{t.hero.note}</div>
        </div>

        {/* módulo de inteligencia */}
        <div className="min-w-[300px] max-w-[460px] flex-[1_1_340px]">
          <div className="rounded-[18px] bg-tinta p-[22px]">
            <div className="mb-4 text-xs font-bold tracking-[.04em] text-ambar-claro">{t.hero.moduleTag}</div>
            <div className="flex items-center gap-[14px]">
              <div className="relative aspect-square flex-1 overflow-hidden rounded-[12px] bg-[#4a3a2b]">
                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#9a876f]">
                  {t.hero.moduleYours}
                </div>
                <div className="absolute bottom-[14%] left-[20%] right-[20%] top-[16%] rounded-[6px] border-[1.5px] border-ambar-claro" />
                <div className="absolute left-[6%] right-[6%] h-[1.5px] animate-[scan_2.6s_ease-in-out_infinite] bg-ambar-claro shadow-[0_0_8px_#E0B878]" />
              </div>
              <div className="w-[66px] flex-shrink-0 text-center">
                <div className="mb-1 text-[10px] text-[#9a876f]">{t.hero.moduleSimilar}</div>
                <div className="font-display text-[30px] font-bold leading-none text-verde">94%</div>
                <svg width="38" height="14" viewBox="0 0 34 14" className="mt-[6px] inline-block" aria-hidden="true">
                  <path d="M2 7 H30" stroke="#9DBE4E" strokeWidth="1.6" strokeDasharray="3 2" />
                  <path d="M26 3 L31 7 L26 11" fill="none" stroke="#9DBE4E" strokeWidth="1.6" />
                </svg>
              </div>
              <div className="relative aspect-square flex-1 overflow-hidden rounded-[12px] bg-[#4a3a2b]">
                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#9a876f]">
                  {t.hero.moduleSeen}
                </div>
                <div className="absolute bottom-[14%] left-[20%] right-[20%] top-[16%] rounded-[6px] border-[1.5px] border-verde" />
                <span className="absolute right-[9px] top-[9px] h-2 w-2 animate-[pulse-dot_1.4s_infinite] rounded-full bg-verde" />
              </div>
            </div>
            <div className="mt-4 text-center text-sm leading-[1.45] text-[#d8c7ac]">
              {t.hero.moduleQuote}
              <br />
              <span className="text-[12.5px] text-[#9a876f]">{t.hero.moduleSub}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueProps() {
  const icons = [
    <path
      key="pin"
      d="M17 5 a9 9 0 0 1 9 9 c0 7 -9 13 -9 13 s-9 -6 -9 -13 a9 9 0 0 1 9 -9 Z"
      fill="none"
      stroke={AMBAR}
      strokeWidth="2.5"
    />,
    <>
      <circle cx="12" cy="17" r="8" fill="none" stroke={AMBAR} strokeWidth="2.5" />
      <circle cx="22" cy="17" r="8" fill="none" stroke={AMBAR} strokeWidth="2.5" />
    </>,
    <>
      <path d="M17 5 L28 12 V28 H6 V12 Z" fill="none" stroke={AMBAR} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M12 20 l3 3 l7 -7" fill="none" stroke={AMBAR} strokeWidth="2.5" />
    </>,
  ];
  return (
    <div className="bg-crema-2">
      <div className="mx-auto grid max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[22px] px-6 py-[clamp(36px,5vw,60px)]">
        {t.features.map((f, i) => (
          <div key={f.title} className="rounded-[16px] bg-crema p-[26px]">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[11px] bg-[#efe0c8]">
              <svg width="24" height="24" viewBox="0 0 34 34" aria-hidden="true">
                {i === 0 ? (
                  <>
                    {icons[0]}
                    <circle cx="17" cy="14" r="3" fill={AMBAR} />
                  </>
                ) : (
                  icons[i]
                )}
              </svg>
            </div>
            <div className="mb-[6px] font-display text-lg font-bold">{f.title}</div>
            <div className="text-sm leading-[1.55] text-[#6b5a48]">{f.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CercaDeTi() {
  return (
    <div id="cerca" className="bg-crema">
      <div className="mx-auto max-w-[1120px] px-6 py-[clamp(36px,5vw,60px)]">
        <h2 className="mb-[6px] font-display text-[clamp(22px,3vw,30px)] font-bold">{t.cerca.heading}</h2>
        <p className="mb-6 max-w-[640px] text-[15px] text-[#8a7962]">{t.cerca.body}</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          {t.cerca.cards.map((card) => (
            <div
              key={card.name}
              className="flex items-center gap-[14px] rounded-[14px] border border-borde bg-crema-card p-[14px]"
            >
              <div className="flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center rounded-[10px] bg-borde text-[10px] text-[#a3906f]">
                foto
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-[4px] px-2 py-[2px] text-[10px] font-extrabold text-white ${
                      card.type === 'lost' ? 'bg-perdido' : 'bg-encontrado'
                    }`}
                  >
                    {card.type === 'lost' ? t.badges.lost : t.badges.found}
                  </span>
                  <span className="font-display text-sm font-bold">{card.name}</span>
                </div>
                <div className="mt-[5px] text-xs text-[#8a7962]">{card.meta}</div>
                <div
                  className={`mt-[2px] text-xs ${
                    card.statusHighlight ? 'font-semibold text-encontrado' : 'text-[#8a7962]'
                  }`}
                >
                  {card.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComoFunciona() {
  return (
    <div id="como" className="bg-tinta">
      <div className="mx-auto max-w-[1120px] px-6 py-[clamp(40px,5vw,64px)]">
        <h2 className="mb-7 font-display text-[clamp(22px,3vw,30px)] font-bold text-crema">{t.como.heading}</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
          {t.como.steps.map((step) => (
            <div key={step.n}>
              <div
                className={`mb-[14px] flex h-[34px] w-[34px] items-center justify-center rounded-[10px] font-display text-base font-bold text-tinta ${
                  step.accent ? 'bg-verde' : 'bg-ambar'
                }`}
              >
                {step.n}
              </div>
              <div className="mb-[6px] font-display text-[17px] font-bold text-crema">{step.title}</div>
              <div className="text-sm leading-[1.55] text-[#c2ac8e]">{step.body}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-[10px]">
          {t.como.badges.map((b) => (
            <span
              key={b}
              className="rounded-[20px] bg-[#4a3a2b] px-[14px] py-[7px] text-xs font-semibold text-ambar-claro"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinalCta() {
  return (
    <div id="reportar" className="bg-ambar">
      <div className="mx-auto max-w-[1120px] px-6 py-[clamp(40px,5vw,64px)] text-center">
        <h2 className="mb-[10px] font-display text-[clamp(24px,3.4vw,36px)] font-bold tracking-[-.01em] text-white">
          {t.finalCta.heading}
        </h2>
        <p className="mb-6 text-base text-[#fbeed9]">{t.finalCta.body}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/perdi"
            className="rounded-[12px] bg-tinta px-10 py-4 text-base font-bold text-crema hover:opacity-90"
          >
            {t.hero.ctaLost}
          </Link>
          <Link
            href="/encontre"
            className="rounded-[12px] border-[1.5px] border-white/70 px-10 py-4 text-base font-bold text-white hover:bg-white/10"
          >
            {t.hero.ctaFound}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="bg-tinta-2">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-start justify-between gap-7 px-6 py-10">
        <div className="max-w-[340px]">
          <div className="mb-3 flex items-center gap-[10px]">
            <Logo size={30} color={AMBAR_CLARO} faceBg="#241B14" eyes={false} />
            <Brand dark />
          </div>
          <div className="text-[13px] leading-[1.55] text-[#a3906f]">{t.footer.tagline}</div>
          <div className="mt-[10px] text-[13px] font-semibold text-ambar-claro">{t.footer.domain}</div>
        </div>
        <div className="flex flex-wrap gap-12">
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[.08em] text-[#8a7358]">
              {t.footer.productHeading}
            </div>
            <div className="flex flex-col gap-[9px] text-sm">
              <Link href="/perdi" className="text-[#c2ac8e] hover:text-ambar-claro">
                {t.footer.productLinks.lost}
              </Link>
              <Link href="/encontre" className="text-[#c2ac8e] hover:text-ambar-claro">
                {t.footer.productLinks.found}
              </Link>
              <a href="#como" className="text-[#c2ac8e] hover:text-ambar-claro">
                {t.footer.productLinks.como}
              </a>
            </div>
          </div>
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[.08em] text-[#8a7358]">
              {t.footer.socialHeading}
            </div>
            <div className="flex flex-col gap-[9px] text-sm">
              {t.footer.social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#c2ac8e] hover:text-ambar-claro"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-[#3a2c20]">
        <div className="mx-auto max-w-[1120px] px-6 py-[18px] text-xs text-[#8a7358]">{t.footer.legal}</div>
      </div>
    </div>
  );
}
