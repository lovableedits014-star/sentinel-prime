import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Shield, MessageSquare, Brain, TrendingUp, BarChart3, Bell,
  Users, Zap, Star, ChevronDown, CheckCircle, ArrowRight,
  Eye, Lock, Rocket, Target, Heart, Award, Clock, AlertTriangle,
  Kanban, MapPin, Briefcase, UserPlus, Share2, Trophy, Radar,
  ShieldAlert, Sparkles, CalendarCheck, Phone, QrCode, FileText,
  Layers, Globe, Megaphone,
} from "lucide-react";

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView();
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target]);
  return <span ref={ref}>{count.toLocaleString("pt-BR")}{suffix}</span>;
}

/* ─── MODULE DATA ─── */

const moduleCategories = [
  {
    id: "redes",
    label: "🌐 Redes Sociais",
    tagline: "Monitore, analise e responda em tempo real",
    modules: [
      {
        icon: MessageSquare, color: "from-blue-500 to-blue-700", badge: "⚡ Tempo Real",
        title: "Central de Comentários",
        desc: "Painel unificado de Facebook + Instagram. Monitore todos os comentários em tempo real, filtre por sentimento e responda sem sair da plataforma.",
        bullets: ["Monitoramento 24/7 Facebook + Instagram", "Filtros por sentimento, status e plataforma", "Resposta direta pelo painel"],
      },
      {
        icon: Brain, color: "from-violet-500 to-purple-700", badge: "🧠 IA Avançada",
        title: "Inteligência Artificial",
        desc: "IA que classifica sentimento e gera respostas contextuais alinhadas ao seu tom de voz.",
        bullets: ["Análise de sentimento automática", "Geração de respostas personalizadas", "Tom de voz configurável por prompt"],
      },
      {
        icon: Users, color: "from-indigo-500 to-indigo-700", badge: "🔍 Mapeamento",
        title: "Mapa de Influenciadores",
        desc: "Identifique quem são os perfis mais influentes que interagem com suas publicações — aliados ou adversários.",
        bullets: ["Ranking de influência por engajamento", "Classificação automática (aliado/neutro/opositor)", "Histórico de interações por perfil"],
      },
    ],
  },
  {
    id: "crm",
    label: "📋 CRM Político",
    tagline: "Conheça cada cidadão e gerencie sua base",
    modules: [
      {
        icon: FileText, color: "from-emerald-500 to-green-700", badge: "👥 Base Política",
        title: "Base Política (CRM)",
        desc: "Hub central de todas as pessoas: eleitores, apoiadores, lideranças, voluntários. Perfil completo com dados, localização, redes sociais e score de engajamento.",
        bullets: ["Perfil unificado com score e classificação", "Filtros por cidade, bairro, tipo e nível de apoio", "Vinculação automática com redes sociais"],
      },
      {
        icon: Layers, color: "from-sky-500 to-blue-700", badge: "📊 Funil",
        title: "Funil de Leads",
        desc: "Acompanhe a jornada de cada contato: de desconhecido a militante ativo. Visualize gargalos e otimize a conversão.",
        bullets: ["Pipeline visual por estágio", "Métricas de conversão por etapa", "Gestão de status do lead"],
      },
      {
        icon: UserPlus, color: "from-lime-500 to-green-600", badge: "📲 Recrutamento",
        title: "Recrutamento por QR Code",
        desc: "Links e QR Codes personalizados para captar contatos em eventos, reuniões e corpo a corpo. O cidadão se cadastra pelo celular em segundos.",
        bullets: ["Formulário público otimizado para celular", "Captura guiada de redes sociais", "Redirect automático para WhatsApp"],
      },
      {
        icon: Phone, color: "from-green-500 to-emerald-700", badge: "📱 WhatsApp",
        title: "Integração WhatsApp",
        desc: "Número oficial de WhatsApp com confirmação de opt-in real. Cada novo cadastro é direcionado para iniciar conversa — garantindo entregabilidade.",
        bullets: ["Confirmação de opt-in real", "Mensagem pré-formatada automática", "Flag de WhatsApp confirmado no CRM"],
      },
    ],
  },
  {
    id: "mobilizacao",
    label: "🚀 Mobilização",
    tagline: "Transforme seguidores em legião ativa",
    modules: [
      {
        icon: Sparkles, color: "from-yellow-500 to-amber-600", badge: "✨ Missões IA",
        title: "Missões de Engajamento",
        desc: "Publique missões para seus apoiadores interagirem em posts estratégicos. Gamificação que transforma seguidores em exército digital.",
        bullets: ["Seletor visual de posts do Facebook e Instagram", "Portal exclusivo do apoiador (PWA)", "Notificações push para novas missões"],
      },
      {
        icon: Share2, color: "from-cyan-500 to-blue-600", badge: "🔗 Indicação",
        title: "Rede de Multiplicadores",
        desc: "Cada apoiador recebe um link único de indicação. O sistema rastreia a árvore de influência e gera ranking de multiplicadores.",
        bullets: ["Link único por apoiador com código de referral", "Árvore de indicações rastreável", "Ranking de multiplicadores por crescimento"],
      },
      {
        icon: Trophy, color: "from-orange-500 to-red-500", badge: "🏆 Ranking",
        title: "Líderes Digitais",
        desc: "Identifique e recompense seus maiores defensores nas redes. Ranking automático por score de engajamento e influência.",
        bullets: ["Ranking automático por engajamento", "Classificação por nível de atividade", "Histórico mensal de performance"],
      },
      {
        icon: CalendarCheck, color: "from-purple-500 to-violet-700", badge: "📅 Presença",
        title: "Check-in e Presenças",
        desc: "Sistema de check-in diário no portal do apoiador. Monitore a presença ativa da sua base e identifique quem está esfriando.",
        bullets: ["Check-in diário com streak tracking", "Alertas de inatividade", "Métricas de presença por período"],
      },
    ],
  },
  {
    id: "operacional",
    label: "⚙️ Operacional",
    tagline: "Gerencie campanha, equipe e território",
    modules: [
      {
        icon: Kanban, color: "from-pink-500 to-rose-700", badge: "📋 Kanban",
        title: "Modo Campanha",
        desc: "Gerenciamento tático com Kanban drag-and-drop, checklists, métricas de progresso e atribuição de responsáveis. Tudo visual e intuitivo.",
        bullets: ["Kanban com arrastar e soltar", "Checklists dentro de cada tarefa", "Dashboard de métricas da campanha"],
      },
      {
        icon: Briefcase, color: "from-slate-500 to-gray-700", badge: "💼 Contratados",
        title: "Gestão de Contratados",
        desc: "Cadastro vinculado a líderes via QR Code, contrato digital automático e disparo de missões por WhatsApp com sistema anti-spam inteligente.",
        bullets: ["Cadastro público com contrato digital + PDF", "Disparo de missões via WhatsApp", "Anti-spam: lotes variáveis, delays randomizados"],
      },
      {
        icon: MapPin, color: "from-emerald-600 to-teal-700", badge: "🗺️ Territorial",
        title: "Inteligência Territorial",
        desc: "Mapeie sua penetração por zona eleitoral, bairro e cidade. Identifique áreas de influência e regiões negligenciadas.",
        bullets: ["Mapeamento por zona eleitoral", "Identificação de áreas descobertas", "Correlação líder × contratados × votos"],
      },
      {
        icon: Globe, color: "from-blue-600 to-indigo-700", badge: "👥 Equipe",
        title: "Gestão de Equipe",
        desc: "Perfis de acesso predefinidos (Gestor Social, Campanha, Operacional). Múltiplos perfis por usuário com permissões cumulativas.",
        bullets: ["Perfis de acesso configuráveis", "Permissões por módulo", "Criação de usuários pelo admin"],
      },
    ],
  },
  {
    id: "inteligencia",
    label: "📊 Inteligência",
    tagline: "Dados que guiam sua estratégia",
    modules: [
      {
        icon: BarChart3, color: "from-sky-500 to-cyan-700", badge: "📈 IED",
        title: "Índice de Eleitorabilidade Digital",
        desc: "Métrica composta (0-100) que cruza sentimento, crescimento, engajamento e presenças para medir sua saúde digital em tempo real.",
        bullets: ["Score composto de 4 dimensões", "Histórico semanal de evolução", "Explicações detalhadas por componente"],
      },
      {
        icon: TrendingUp, color: "from-green-500 to-emerald-700", badge: "📊 Score",
        title: "Score de Engajamento",
        desc: "Cada apoiador recebe um score baseado em curtidas, comentários e compartilhamentos. Configurável por pesos para cada tipo de interação.",
        bullets: ["Pontuação configurável por ação", "Recálculo automático mensal", "Ranking comparativo entre apoiadores"],
      },
      {
        icon: Megaphone, color: "from-red-500 to-rose-700", badge: "📞 Telemarketing",
        title: "Central de Verificação",
        desc: "Operadores ligam para indicações dos contratados, verificando intenção de voto. Click-to-call no celular com controle de resultado.",
        bullets: ["Fila inteligente de ligações", "Click-to-call direto no celular", "Marcação de confirmação/negação de voto"],
      },
    ],
  },
];

const testimonials = [
  {
    name: "Carlos Mendes", role: "Vereador eleito – São Paulo/SP", avatar: "CM",
    color: "from-blue-500 to-blue-700", stars: 5,
    text: "Antes do Sentinelle eu perdia comentários importantes e minha equipe vivia apagando incêndios. Hoje respondemos tudo em menos de 2 horas e já identificamos 3 crises antes de virarem virais.",
  },
  {
    name: "Beatriz Almeida", role: "Deputada Estadual – Minas Gerais", avatar: "BA",
    color: "from-violet-500 to-purple-600", stars: 5,
    text: "O sistema de apoiadores é simplesmente genial. Consegui mapear meus 200 maiores defensores nas redes e engajá-los em momentos críticos. Minha base ficou 3x mais ativa em 60 dias.",
  },
  {
    name: "Ricardo Souza", role: "Assessor de comunicação digital", avatar: "RS",
    color: "from-emerald-500 to-green-600", stars: 5,
    text: "Gerencio 4 mandatos com a mesma equipe. Antes era impossível. Hoje o Sentinelle me dá controle total: sei o que está acontecendo em cada perfil sem ficar colado no celular.",
  },
  {
    name: "Fernanda Costa", role: "Candidata a Prefeita – Interior do RS", avatar: "FC",
    color: "from-rose-500 to-pink-600", stars: 5,
    text: "O módulo de contratados revolucionou minha operação de campo. QR Code, contrato digital, disparo de missões — tudo automatizado. Economizei 40h/semana da minha equipe.",
  },
];

const Index = () => {
  const [scrollY, setScrollY] = useState(0);
  const [activeCategory, setActiveCategory] = useState("redes");

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const heroSection = useInView();
  const statsSection = useInView();
  const featuresSection = useInView();
  const testimonialsSection = useInView();

  const currentCategory = moduleCategories.find(c => c.id === activeCategory) || moduleCategories[0];

  const totalModules = moduleCategories.reduce((acc, c) => acc + c.modules.length, 0);

  return (
    <div className="min-h-screen bg-[hsl(217,33%,8%)] text-white overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrollY > 60 ? "bg-[hsl(217,33%,8%)]/95 backdrop-blur-md border-b border-white/10 shadow-xl" : ""}`}>
        <div className="container mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/sentinelle-logo.png" alt="Sentinelle" className="h-20 w-auto object-contain drop-shadow-[0_0_16px_rgba(59,130,246,0.45)]" />
          </div>
          <div className="flex items-center gap-3">
            <a href="https://wa.me/5567992773931?text=Olá!%20Quero%20conhecer%20o%20Sentinelle" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/5 hidden sm:flex gap-1.5 text-xs">
                <Phone className="w-3.5 h-3.5" /> Falar com consultor
              </Button>
            </a>
            <Link to="/auth">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all hover:scale-105">
                Entrar na plataforma →
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 pt-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/20 rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: "linear-gradient(hsl(217,91%,60%) 1px, transparent 1px), linear-gradient(90deg, hsl(217,91%,60%) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div ref={heroSection.ref} className={`relative z-10 max-w-5xl transition-all duration-1000 ${heroSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="flex justify-center mb-6">
            <img
              src="/sentinelle-logo.png"
              alt="Sentinelle"
              className="h-48 md:h-64 w-auto object-contain drop-shadow-[0_0_40px_rgba(59,130,246,0.45)] animate-fade-in"
            />
          </div>
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-5 py-2 mb-8 text-sm text-blue-300">
            <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span>{totalModules}+ módulos integrados — a plataforma mais completa do mercado político</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-none mb-6 tracking-tight">
            <span className="block text-white">Comando digital</span>
            <span className="block bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400 bg-clip-text text-transparent">
              completo para políticos.
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-white/60 max-w-3xl mx-auto mb-4 leading-relaxed">
            De redes sociais a operação de campo. Monitore comentários, gerencie apoiadores,
            coordene contratados, dispare missões e meça sua eleitorabilidade — tudo em um único painel.
          </p>

          <p className="text-sm text-blue-400/80 mb-10 font-medium">
            ⚠️ Enquanto você ainda está pensando, seus concorrentes já estão usando.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://wa.me/5567992773931?text=Olá!%20Quero%20uma%20demonstração%20do%20Sentinelle" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="relative bg-blue-600 hover:bg-blue-500 text-white px-10 py-6 text-lg font-bold shadow-2xl shadow-blue-600/40 hover:shadow-blue-500/60 transition-all duration-300 hover:scale-105 group rounded-xl">
                <span>Solicitar demonstração</span>
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <a href="#features">
              <Button size="lg" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/5 px-8 py-6 text-lg rounded-xl transition-all">
                Ver módulos <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </a>
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-white/40 text-xs">
            <div className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Dados 100% seguros</div>
            <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Monitoramento 24/7</div>
            <div className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5" /> Suporte dedicado</div>
            <div className="flex items-center gap-1.5"><QrCode className="w-3.5 h-3.5" /> Setup personalizado</div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/30">
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="py-20 border-y border-white/5 bg-white/[0.02]">
        <div ref={statsSection.ref} className={`container mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-8 text-center transition-all duration-1000 ${statsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {[
            { value: totalModules, suffix: "+", label: "Módulos integrados" },
            { value: 24, suffix: "h", label: "Monitoramento contínuo" },
            { value: 5, suffix: "x", label: "Mais engajamento médio" },
            { value: 3, suffix: "x", label: "Mais apoiadores ativos" },
            { value: 98, suffix: "%", label: "Taxa de satisfação" },
          ].map((stat, i) => (
            <div key={i} className="space-y-2">
              <div className="text-4xl md:text-5xl font-black text-blue-400">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              </div>
              <p className="text-white/50 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES BY CATEGORY ── */}
      <section id="features" className="py-24 px-4">
        <div ref={featuresSection.ref} className={`container mx-auto transition-all duration-1000 ${featuresSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="text-center mb-16">
            <span className="inline-block text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">Plataforma Completa</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              {totalModules} módulos para<br />
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">dominar cada frente</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Do monitoramento de redes sociais à operação de campo — cada módulo resolve uma dor real de quem vive de política.
            </p>
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {moduleCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${activeCategory === cat.id ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Category tagline */}
          <p className="text-center text-white/40 text-sm mb-8 -mt-4">{currentCategory.tagline}</p>

          {/* Module cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentCategory.modules.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <div
                  key={i}
                  className="relative rounded-2xl p-6 border bg-white/[0.03] border-white/5 hover:bg-white/[0.07] hover:border-white/15 transition-all duration-500 group hover:scale-[1.01]"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mod.color} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xs bg-white/10 text-white/60 px-2.5 py-1 rounded-full">{mod.badge}</span>
                  </div>
                  <h3 className="text-lg font-bold mb-3 text-white">{mod.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-4">{mod.desc}</p>
                  <ul className="space-y-2">
                    {mod.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-white/60">
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Module count summary */}
          <div className="mt-12 text-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-3 text-white/30 text-xs">
              {moduleCategories.map(cat => (
                <span key={cat.id} className={`px-3 py-1 rounded-full border ${activeCategory === cat.id ? "border-blue-500/50 text-blue-400" : "border-white/10"}`}>
                  {cat.label.split(" ").slice(1).join(" ")}: {cat.modules.length} módulos
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 px-4 border-y border-white/5 bg-white/[0.02]">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <span className="inline-block text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">Como funciona</span>
            <h2 className="text-3xl md:text-4xl font-black">
              Do zero ao controle total em <span className="text-blue-400">3 passos</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: Phone, title: "Solicite sua demonstração", desc: "Fale com nosso consultor pelo WhatsApp. Entendemos sua necessidade e preparamos o setup ideal." },
              { step: "02", icon: Zap, title: "Setup personalizado", desc: "Nossa equipe configura a plataforma, conecta suas redes sociais e treina sua equipe — tudo incluso." },
              { step: "03", icon: Rocket, title: "Domine suas redes", desc: "Monitore, engaje, recrute e coordene tudo de um único painel. Resultados em dias, não meses." },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="text-center space-y-4">
                  <div className="relative mx-auto w-16 h-16">
                    <div className="absolute inset-0 rounded-2xl bg-blue-600/20 rotate-6" />
                    <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-xl shadow-blue-600/30">
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white text-[hsl(217,33%,8%)] text-xs font-black flex items-center justify-center">{s.step}</span>
                  </div>
                  <h3 className="font-bold text-lg">{s.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── URGENCY BANNER ── */}
      <section className="py-16 px-4 bg-gradient-to-r from-red-900/30 via-orange-900/20 to-red-900/30 border-y border-red-500/20">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-red-500/20 border border-red-500/30 rounded-full px-4 py-1.5 mb-6 text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Atenção: seus concorrentes não estão esperando</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            Cada dia sem monitoramento é<br />
            <span className="text-red-400">uma oportunidade perdida.</span>
          </h2>
          <p className="text-white/50 max-w-2xl mx-auto mb-8 text-lg">
            Comentários sem resposta, apoiadores esfriando, contratados sem missão, crises sem gestão.
            O Sentinelle resolve tudo isso — agora.
          </p>
          <a href="https://wa.me/5567992773931?text=Quero%20controlar%20minha%20presença%20digital%20com%20o%20Sentinelle" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-6 text-lg font-bold shadow-2xl shadow-blue-600/40 hover:scale-105 transition-all duration-300 rounded-xl">
              Quero controlar minha presença digital <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </a>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 px-4">
        <div ref={testimonialsSection.ref} className={`container mx-auto transition-all duration-1000 ${testimonialsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="text-center mb-16">
            <span className="inline-block text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">Depoimentos</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              Quem usa,{" "}
              <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">não para.</span>
            </h2>
            <p className="text-white/50 text-lg">Resultados reais de quem apostou no Sentinelle.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] hover:border-white/20 transition-all duration-300 hover:scale-[1.01]">
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-white/70 leading-relaxed mb-6 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-sm font-bold text-white`}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{t.name}</p>
                    <p className="text-white/40 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative container mx-auto text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-5 py-2 mb-8 text-green-400 text-sm">
            <Rocket className="w-4 h-4" />
            <span>Pronto para assumir o controle?</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-black mb-6">
            Sua concorrência não vai<br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">te esperar.</span>
          </h2>
          <p className="text-white/50 text-lg mb-10">
            {totalModules}+ módulos. Uma plataforma. Controle total da sua presença digital e operação de campo.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://wa.me/5567992773931?text=Quero%20começar%20a%20usar%20o%20Sentinelle%20agora" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="relative bg-blue-600 hover:bg-blue-500 text-white px-12 py-7 text-xl font-black shadow-2xl shadow-blue-600/40 hover:shadow-blue-500/60 transition-all duration-300 hover:scale-105 rounded-2xl group">
                Solicitar demonstração
                <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>
            <Link to="/auth">
              <Button size="lg" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/5 px-8 py-7 text-lg rounded-2xl">
                Já tenho conta →
              </Button>
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-white/30 text-xs">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Acesso seguro</span>
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Sem surpresas</span>
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> Suporte humano</span>
            <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Resultados reais</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-8 text-center text-white/20 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <img src="/sentinelle-logo.png" alt="Sentinelle" className="w-6 h-6 object-contain opacity-70" />
          <span className="font-semibold text-white/40">Sentinelle</span>
        </div>
        <p>© {new Date().getFullYear()} Sentinelle. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Index;
