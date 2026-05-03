import { useEffect, useMemo, useState, useCallback } from "react";
import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, MessageSquare, Settings, LogOut, Shield,
  Users, TrendingUp, Crown, Menu, X, MapPin, BookUser, UserPlus, Kanban, Sparkles, Trophy, Target, Briefcase, Send, CalendarCheck, Vote, CalendarDays, Newspaper, Activity, Megaphone, Brain,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { isPathAllowed, getRoleLabels, type AccessProfile } from "@/lib/access-control";
import { CoringaButton } from "@/components/coringa/CoringaButton";

const AUTH_CHECK_TIMEOUT_MS = 12000;

const hasStoredAuthSession = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (raw && raw.length > 20) return true;
      }
    }
  } catch {}
  return false;
};

const getStoredAuthUser = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const storedUser = parsed?.user || parsed?.currentSession?.user;
      if (storedUser?.id) return storedUser;
    }
  } catch {}
  return null;
};

const withTimeout = async <T,>(promise: PromiseLike<T>, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), AUTH_CHECK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

type MenuSection = {
  label: string;
  items: { icon: any; label: string; path: string }[];
};

const MENU_SECTIONS: MenuSection[] = [
  {
    label: "Redes Sociais",
    items: [
      { icon: MessageSquare, label: "Comentários", path: "/comments" },
      { icon: Megaphone, label: "Militância Digital", path: "/militancia" },
      { icon: TrendingUp, label: "Engajamento", path: "/engagement" },
      { icon: Brain, label: "Inteligência de Conteúdo", path: "/inteligencia-conteudo" },
    ],
  },
  {
    label: "Base Política",
    items: [
      { icon: BookUser, label: "Pessoas", path: "/pessoas" },
    ],
  },
  {
    label: "Mobilização",
    items: [
      { icon: Sparkles, label: "Missões IA", path: "/missoes-ia" },
      { icon: Users, label: "Funcionários", path: "/funcionarios" },
      { icon: CalendarCheck, label: "Controle de Presença", path: "/presenca" },
      { icon: CalendarDays, label: "Calendário Político", path: "/calendario-politico" },
    ],
  },
  {
    label: "Operacional",
    items: [
      { icon: Send, label: "Disparos WhatsApp", path: "/disparos" },
      { icon: Briefcase, label: "Contratados", path: "/contratados" },
      { icon: MapPin, label: "Territorial", path: "/territorial" },
      { icon: Vote, label: "Inteligência Eleitoral", path: "/inteligencia-eleitoral" },
      { icon: Newspaper, label: "Mídia", path: "/midia" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { icon: Activity, label: "Status WhatsApp", path: "/status-whatsapp" },
      { icon: Settings, label: "Configurações", path: "/settings" },
    ],
  },
];

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accessProfile, setAccessProfile] = useState<AccessProfile | null>(null);
  const [isClientOwner, setIsClientOwner] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const refreshAllData = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    let mounted = true;

    const checkUser = async () => {
      try {
        if (hasStoredAuthSession()) {
          const storedUser = getStoredAuthUser();
          if (storedUser) setUser(storedUser);
          setIsClientOwner(true);
          setAccessProfile(null);
          setLoading(false);
        }

        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          "Tempo esgotado ao verificar sua sessão"
        );
        if (!mounted) return;
        if (!session) { navigate("/auth", { replace: true }); return; }
        setUser(session.user);

        // Super admin gets full access regardless of clients/team_members
        const { data: isSuperAdmin } = await withTimeout(
          supabase.rpc("is_super_admin"),
          "Tempo esgotado ao verificar super admin"
        );
        if (!mounted) return;

        if (isSuperAdmin === true) {
          setIsSuperAdmin(true);
          setIsClientOwner(true);
          setAccessProfile(null); // full access
        } else {
          setIsSuperAdmin(false);
          // Check if user is a client owner
          const { data: clientData, error: clientError } = await withTimeout(
            supabase
              .from("clients")
              .select("id")
              .eq("user_id", session.user.id)
              .limit(1)
              .maybeSingle(),
            "Tempo esgotado ao carregar suas permissões"
          );
          if (!mounted) return;
          if (clientError) throw clientError;

          if (clientData) {
            setIsClientOwner(true);
            setAccessProfile(null); // full access
          } else {
          // Check if user is a team member
          const { data: teamData, error: teamError } = await withTimeout(
            supabase
              .from("team_members")
              .select("role")
              .eq("user_id", session.user.id)
              .eq("status", "active")
              .limit(1)
              .maybeSingle(),
            "Tempo esgotado ao carregar suas permissões"
          );
          if (!mounted) return;
          if (teamError) throw teamError;

          if (teamData) {
            setAccessProfile(teamData.role as AccessProfile);
          } else {
            // No access at all - redirect
            toast.error("Você não tem permissão para acessar o painel");
            await supabase.auth.signOut();
            navigate("/auth", { replace: true });
            return;
          }
          }
        }

        setLoading(false);
      } catch (error: any) {
        console.error("Falha ao carregar acesso ao painel:", error);
        if (!mounted) return;
        // Modo otimista: se há token persistido em localStorage, libera acesso
        // mesmo com timeout — evita travar a UI por lentidão de rede.
        if (hasStoredAuthSession()) {
          toast.error("Conexão lenta ao verificar permissões. Liberando acesso...");
          setIsClientOwner(true);
          setAccessProfile(null);
          setLoading(false);
          return;
        }
        // Sem token: mostra tela de erro com retry / voltar ao login.
        const message = error?.message || "Não foi possível verificar sua sessão.";
        setTimeoutError(message);
        setLoading(false);
      }
    };
    setTimeoutError(null);
    setLoading(true);
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setUser(session.user);
        // Só invalida cache em SIGNED_IN explícito; TOKEN_REFRESHED não deve forçar refetch geral.
        if (event === "SIGNED_IN") refreshAllData();
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [navigate, refreshAllData, retryCount]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Route protection
  useEffect(() => {
    if (loading || isClientOwner || !accessProfile) return;
    const currentPath = location.pathname;
    if (!isPathAllowed(accessProfile, currentPath)) {
      navigate("/dashboard");
      toast.error("Você não tem acesso a esta página");
    }
  }, [location.pathname, accessProfile, isClientOwner, loading, navigate]);

  // Filter menu items based on access profile (memoized — antes dos returns condicionais para manter ordem de hooks)
  const filteredSections = useMemo(() => MENU_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item =>
      isClientOwner || !accessProfile || isPathAllowed(accessProfile, item.path)
    ),
  })).filter(section => section.items.length > 0), [isClientOwner, accessProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado com sucesso");
    navigate("/auth");
  };

  if (timeoutError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4 rounded-lg border bg-card p-6 shadow-sm">
          <div className="mx-auto h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <X className="h-5 w-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Não conseguimos verificar sua sessão</h2>
            <p className="text-sm text-muted-foreground">{timeoutError}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                setTimeoutError(null);
                setLoading(true);
                setRetryCount((c) => c + 1);
              }}
            >
              Tentar novamente
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut().catch(() => {});
                navigate("/auth", { replace: true });
              }}
            >
              Voltar ao login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // (filteredSections está calculado acima — antes dos returns condicionais — para manter ordem de hooks)

  const NavItem = ({ item, mobile = false }: { item: { icon: any; label: string; path: string }; mobile?: boolean }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`flex items-center gap-3 rounded-lg px-3 ${mobile ? 'py-3' : 'py-2.5'} text-sm font-medium transition-all hover:bg-sidebar-accent ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80"
        }`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const SidebarNav = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
      {/* Dashboard - always first */}
      {(isClientOwner || !accessProfile || isPathAllowed(accessProfile, '/dashboard')) && (
        <NavItem item={{ icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" }} mobile={mobile} />
      )}

      {/* Grouped sections */}
      {filteredSections.map((section) => (
        <div key={section.label} className="pt-3 mt-2">
          <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
            {section.label}
          </p>
          {section.items.map((item) => (
            <NavItem key={item.path} item={item} mobile={mobile} />
          ))}
        </div>
      ))}

      {isSuperAdmin && (
        <div className="pt-2 mt-2 border-t border-sidebar-border">
          <Link
            to="/super-admin"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-sidebar-accent ${
              location.pathname === "/super-admin"
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-amber-400/90 hover:text-amber-400"
            }`}
          >
            <Crown className="w-5 h-5 shrink-0" />
            <span>Super Admin</span>
          </Link>
        </div>
      )}
    </nav>
  );

  const UserSection = () => (
    <div className="border-t border-sidebar-border p-4">
      <div className="flex items-center gap-3 mb-3 px-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-sm font-medium text-primary">
            {user?.email?.[0]?.toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate text-sidebar-foreground/80">{user?.email}</p>
          {accessProfile && (
            <p className="text-[10px] text-sidebar-foreground/50 truncate">
              {getRoleLabels(accessProfile).join(' · ')}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:text-sidebar-foreground"
        onClick={handleLogout}
      >
        <LogOut className="w-4 h-4 shrink-0" />
        Sair
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ── DESKTOP sidebar ── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
        <div className="flex h-full flex-col">
          <div className="flex h-40 items-center justify-center border-b border-sidebar-border px-6 py-3">
            <img src="/sentinelle-logo.png" alt="Sentinelle" className="h-32 w-auto object-contain" />
          </div>
          <SidebarNav />
          <UserSection />
        </div>
      </aside>

      {/* ── MOBILE top bar ── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-20 flex items-center gap-3 border-b bg-sidebar text-sidebar-foreground px-4 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center justify-center flex-1">
          <img src="/sentinelle-logo.png" alt="Sentinelle" className="h-16 w-auto object-contain" />
        </div>
      </header>

      {/* ── MOBILE drawer ── */}
      {mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-sidebar text-sidebar-foreground shadow-2xl flex flex-col">
            <div className="flex items-center justify-between h-24 px-4 border-b border-sidebar-border">
              <div className="flex items-center justify-center flex-1">
                <img src="/sentinelle-logo.png" alt="Sentinelle" className="h-20 w-auto object-contain" />
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarNav mobile />
            <UserSection />
          </aside>
        </>
      )}

      {/* ── Main Content ── */}
      <main className="lg:pl-64 pt-20 lg:pt-0">
        <div className="min-h-screen">
          <Outlet />
        </div>
      </main>
      <CoringaButton />
    </div>
  );
};

export default DashboardLayout;
