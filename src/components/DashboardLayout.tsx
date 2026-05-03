import { useEffect, useState, useCallback } from "react";
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
  const [user, setUser] = useState<any>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accessProfile, setAccessProfile] = useState<AccessProfile | null>(null);
  const [isClientOwner, setIsClientOwner] = useState(false);

  const refreshAllData = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);

      // Check if user is a client owner
      const { data: clientData } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();

      if (clientData) {
        setIsClientOwner(true);
        setAccessProfile(null); // full access
      } else {
        // Check if user is a team member
        const { data: teamData } = await supabase
          .from("team_members")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (teamData) {
          setAccessProfile(teamData.role as AccessProfile);
        } else {
          // No access at all - redirect
          toast.error("Você não tem permissão para acessar o painel");
          await supabase.auth.signOut();
          navigate("/auth");
          return;
        }
      }

      setLoading(false);
      refreshAllData();
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") refreshAllData();
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, refreshAllData]);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado com sucesso");
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const SUPER_ADMIN_EMAIL = "lovableedits014@gmail.com";
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;

  // Filter menu items based on access profile
  const filteredSections = MENU_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item =>
      isClientOwner || !accessProfile || isPathAllowed(accessProfile, item.path)
    ),
  })).filter(section => section.items.length > 0);

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
