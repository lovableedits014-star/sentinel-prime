import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Comments from "./pages/Comments";
import Engagement from "./pages/Engagement";
import Settings from "./pages/Settings";
import DashboardLayout from "./components/DashboardLayout";
import NotFound from "./pages/NotFound";
import SupporterRegister from "./pages/SupporterRegister";
import SupporterPortal from "./pages/SupporterPortal";
import PwaStart from "./pages/PwaStart";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import SuperAdmin from "./pages/SuperAdmin";
import Disparos from "./pages/Disparos";
import Territorial from "./pages/Territorial";
import Pessoas from "./pages/Pessoas";
import PessoaPerfil from "./pages/PessoaPerfil";
import RegistroPessoa from "./pages/RegistroPessoa";

import MissoesIA from "./pages/MissoesIA";
import Funcionarios from "./pages/Funcionarios";
import ControlePresenca from "./pages/ControlePresenca";
import Contratados from "./pages/Contratados";
import ContratadosDisparos from "./pages/ContratadosDisparos";
import ContratadosRelatorios from "./pages/ContratadosRelatorios";
import RegistroContratado from "./pages/RegistroContratado";
import PortalContratado from "./pages/PortalContratado";
import RegistroFuncionario from "./pages/RegistroFuncionario";
import PortalFuncionario from "./pages/PortalFuncionario";
import Telemarketing from "./pages/Telemarketing";
import CadastroUnificado from "./pages/CadastroUnificado";
import CadastroLiderConvite from "./pages/CadastroLiderConvite";
import PortalUnificado from "./pages/PortalUnificado";
import InteligenciaEleitoral from "./pages/InteligenciaEleitoral";
import CalendarioPolitico from "./pages/CalendarioPolitico";
import Midia from "./pages/Midia";
import StatusWhatsApp from "./pages/StatusWhatsApp";
import Militancia from "./pages/Militancia";
import InteligenciaConteudo from "./pages/InteligenciaConteudo";
import { Navigate, useParams, useLocation } from "react-router-dom";

// Wrappers de redirect para preservar links antigos
const RedirectToCadastro = ({ extraQuery = "" }: { extraQuery?: string }) => {
  const { clientId } = useParams();
  const location = useLocation();
  const sep = location.search ? "&" : "?";
  const target = `/cadastro/${clientId}${location.search}${extraQuery ? sep + extraQuery : ""}`;
  return <Navigate to={target} replace />;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/signup/:token" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/cadastro/:clientId" element={<CadastroUnificado />} />
          <Route path="/cadastro-lider/:token" element={<CadastroLiderConvite />} />
          {/* Redirects de rotas antigas de cadastro (mantém compatibilidade com links já compartilhados) */}
          <Route path="/registro/:clientId" element={<RedirectToCadastro extraQuery="modo=detalhado" />} />
          <Route path="/funcionario/:clientId" element={<RedirectToCadastro extraQuery="papel=funcionario" />} />
          {/* Portais antigos seguem ativos até a Entrega 2 (Portal Unificado) */}
          <Route path="/portal-funcionario/:clientId" element={<PortalFuncionario />} />
          <Route path="/portal-contratado/:clientId" element={<PortalContratado />} />
          <Route path="/contratado/:clientId" element={<RegistroContratado />} />
          <Route path="/contratado/:clientId/:liderId" element={<RegistroContratado />} />
          <Route path="/telemarketing/:clientId" element={<Telemarketing />} />
          {/* Portal unificado: detecta papéis e direciona */}
          <Route path="/portal/:clientId" element={<PortalUnificado />} />
          <Route path="/portal-apoiador/:clientId" element={<SupporterPortal />} />
          <Route path="/pwa-start" element={<PwaStart />} />
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/comments" element={<Comments />} />
            <Route path="/militancia" element={<Militancia />} />
            <Route path="/engagement" element={<Engagement />} />
            <Route path="/inteligencia-conteudo" element={<InteligenciaConteudo />} />
            <Route path="/disparos" element={<Disparos />} />
            <Route path="/territorial" element={<Territorial />} />
            <Route path="/pessoas" element={<Pessoas />} />
            <Route path="/pessoas/:id" element={<PessoaPerfil />} />
            <Route path="/recrutamento" element={<Territorial />} />
            <Route path="/missoes-ia" element={<MissoesIA />} />
            <Route path="/funcionarios" element={<Funcionarios />} />
            <Route path="/presenca" element={<ControlePresenca />} />
            <Route path="/contratados" element={<Contratados />} />
            <Route path="/contratados/disparos" element={<ContratadosDisparos />} />
            <Route path="/contratados/relatorios" element={<ContratadosRelatorios />} />
            <Route path="/inteligencia-eleitoral" element={<InteligenciaEleitoral />} />
            <Route path="/calendario-politico" element={<CalendarioPolitico />} />
            <Route path="/midia" element={<Midia />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/status-whatsapp" element={<StatusWhatsApp />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

