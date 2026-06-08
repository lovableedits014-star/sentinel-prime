import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  unstable_HistoryRouter as HistoryRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { createBrowserHistory, type BrowserHistory } from "history";
import DashboardLayout from "./components/DashboardLayout";
import RequireRole from "./components/RequireRole";

// Lazy-load all pages so each route loads only its own chunk on demand.
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Comments = lazy(() => import("./pages/Comments"));
const Engagement = lazy(() => import("./pages/Engagement"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SupporterPortal = lazy(() => import("./pages/SupporterPortal"));
const PwaStart = lazy(() => import("./pages/PwaStart"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const Disparos = lazy(() => import("./pages/Disparos"));
const Territorial = lazy(() => import("./pages/Territorial"));
const Pessoas = lazy(() => import("./pages/Pessoas"));
const PessoaPerfil = lazy(() => import("./pages/PessoaPerfil"));
const MissoesIA = lazy(() => import("./pages/MissoesIA"));
const Funcionarios = lazy(() => import("./pages/Funcionarios"));
const ControlePresenca = lazy(() => import("./pages/ControlePresenca"));
const Contratados = lazy(() => import("./pages/Contratados"));
const Eleicao = lazy(() => import("./pages/Eleicao"));
const ContratadosDisparos = lazy(() => import("./pages/ContratadosDisparos"));
const ContratadosRelatorios = lazy(() => import("./pages/ContratadosRelatorios"));
const RegistroContratado = lazy(() => import("./pages/RegistroContratado"));
const PortalContratado = lazy(() => import("./pages/PortalContratado"));
const PortalFuncionario = lazy(() => import("./pages/PortalFuncionario"));
const PortalCoordenador = lazy(() => import("./pages/PortalCoordenador"));
const Telemarketing = lazy(() => import("./pages/Telemarketing"));
const CadastroUnificado = lazy(() => import("./pages/CadastroUnificado"));
const CadastroLiderConvite = lazy(() => import("./pages/CadastroLiderConvite"));
const IndicarPublico = lazy(() => import("./pages/IndicarPublico"));
const PortalUnificado = lazy(() => import("./pages/PortalUnificado"));
const InteligenciaEleitoral = lazy(() => import("./pages/InteligenciaEleitoral"));
const CalendarioPolitico = lazy(() => import("./pages/CalendarioPolitico"));
const Midia = lazy(() => import("./pages/Midia"));
const StatusWhatsApp = lazy(() => import("./pages/StatusWhatsApp"));
const CentralWhatsApp = lazy(() => import("./pages/CentralWhatsApp"));
const Militancia = lazy(() => import("./pages/Militancia"));
const InteligenciaConteudo = lazy(() => import("./pages/InteligenciaConteudo"));
const FotoPublica = lazy(() => import("./pages/FotoPublica"));
const TelemarketingAdmin = lazy(() => import("./pages/TelemarketingAdmin"));
const TelemarketingAdminFila = lazy(() => import("./pages/TelemarketingAdminFila"));
const TelemarketingAdminResultados = lazy(() => import("./pages/TelemarketingAdminResultados"));
const TelemarketingAdminRelatorios = lazy(() => import("./pages/TelemarketingAdminRelatorios"));
const TelemarketingAdminOperadores = lazy(() => import("./pages/TelemarketingAdminOperadores"));
const TelemarketingAdminConfig = lazy(() => import("./pages/TelemarketingAdminConfig"));
const TelemarketingAdminCampanhas = lazy(() => import("./pages/TelemarketingAdminCampanhas"));
const TelemarketingAdminFilas = lazy(() => import("./pages/TelemarketingAdminFilas"));

// Wrappers de redirect para preservar links antigos
const RedirectToCadastro = ({ extraQuery = "" }: { extraQuery?: string }) => {
  const { clientId } = useParams();
  const location = useLocation();
  const sep = location.search ? "&" : "?";
  const target = `/cadastro/${clientId}${location.search}${extraQuery ? sep + extraQuery : ""}`;
  return <Navigate to={target} replace />;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
    Carregando…
  </div>
);

const AppRouter = () => {
  const [history, setHistory] = useState<BrowserHistory | null>(null);

  useEffect(() => {
    setHistory(createBrowserHistory({ window }));
  }, []);

  if (!history) return <PageFallback />;

  return (
    <HistoryRouter history={history as any} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/signup/:token" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/super-admin"
              element={
                <RequireRole role="super_admin">
                  <SuperAdmin />
                </RequireRole>
              }
            />
            <Route path="/cadastro/:clientId" element={<CadastroUnificado />} />
            <Route path="/cadastro-lider/:token" element={<CadastroLiderConvite />} />
            <Route path="/indicar/:token" element={<IndicarPublico />} />
            {/* Redirects de rotas antigas de cadastro (mantém compatibilidade com links já compartilhados) */}
            <Route path="/registro/:clientId" element={<RedirectToCadastro extraQuery="modo=detalhado" />} />
            <Route path="/funcionario/:clientId" element={<RedirectToCadastro extraQuery="papel=funcionario" />} />
            {/* Portais antigos seguem ativos até a Entrega 2 (Portal Unificado) */}
            <Route path="/portal-funcionario/:clientId" element={<PortalFuncionario />} />
            <Route path="/portal-coordenador/:clientId" element={<PortalCoordenador />} />
            <Route path="/portal-contratado/:clientId" element={<PortalContratado />} />
            <Route path="/contratado/:clientId" element={<RegistroContratado />} />
            <Route path="/contratado/:clientId/:liderId" element={<RegistroContratado />} />
            <Route path="/telemarketing/:clientId" element={<Telemarketing />} />
            {/* Portal unificado: detecta papéis e direciona */}
            <Route path="/portal/:clientId" element={<PortalUnificado />} />
            <Route path="/portal-apoiador/:clientId" element={<SupporterPortal />} />
            <Route path="/pwa-start" element={<PwaStart />} />
            <Route path="/foto/:clientId" element={<FotoPublica />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/comments" element={<Comments />} />
              <Route path="/militancia" element={<Militancia />} />
              <Route path="/engagement" element={<Engagement />} />
              <Route path="/inteligencia-conteudo" element={<InteligenciaConteudo />} />
              <Route path="/whatsapp" element={<CentralWhatsApp />} />
              <Route path="/disparos" element={<Navigate to="/whatsapp?tab=disparos" replace />} />
              <Route path="/territorial" element={<Territorial />} />
              <Route path="/pessoas" element={<Pessoas />} />
              <Route path="/pessoas/:id" element={<PessoaPerfil />} />
              <Route path="/recrutamento" element={<Territorial />} />
              <Route path="/missoes-ia" element={<Navigate to="/whatsapp?tab=missoes" replace />} />
              <Route path="/funcionarios" element={<Funcionarios />} />
              <Route path="/presenca" element={<ControlePresenca />} />
              <Route path="/contratados" element={<Navigate to="/eleicao" replace />} />
              <Route path="/eleicao" element={<Eleicao />} />
              <Route path="/contratados/disparos" element={<ContratadosDisparos />} />
              <Route path="/contratados/relatorios" element={<ContratadosRelatorios />} />
              <Route path="/inteligencia-eleitoral" element={<InteligenciaEleitoral />} />
              <Route path="/calendario-politico" element={<CalendarioPolitico />} />
              <Route path="/midia" element={<Midia />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/telemarketing-admin" element={<TelemarketingAdmin />} />
              <Route path="/telemarketing-admin/fila" element={<TelemarketingAdminFila />} />
              <Route path="/telemarketing-admin/resultados" element={<TelemarketingAdminResultados />} />
              <Route path="/telemarketing-admin/relatorios" element={<TelemarketingAdminRelatorios />} />
              <Route path="/telemarketing-admin/operadores" element={<TelemarketingAdminOperadores />} />
              <Route path="/telemarketing-admin/configuracoes" element={<TelemarketingAdminConfig />} />
              <Route path="/telemarketing-admin/campanhas" element={<TelemarketingAdminCampanhas />} />
              <Route path="/status-whatsapp" element={<Navigate to="/whatsapp?tab=status" replace />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </HistoryRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppRouter />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
