import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListChecks, BarChart3, Users, Settings as SettingsIcon, Phone, Megaphone, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/telemarketing-admin", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/telemarketing-admin/filas", label: "Filas", icon: Phone },
  { to: "/telemarketing-admin/resultados", label: "Resultados", icon: ListChecks },
  { to: "/telemarketing-admin/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/telemarketing-admin/ranking", label: "Ranking", icon: Trophy },
  { to: "/telemarketing-admin/operadores", label: "Operadores", icon: Users },
  { to: "/telemarketing-admin/configuracoes", label: "Configurações", icon: SettingsIcon },
];

export default function TelemarketingSubNav() {
  return (
    <nav className="flex items-center gap-1 border-b -mx-4 md:-mx-6 px-4 md:px-6 mb-6 overflow-x-auto">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )
          }
        >
          <it.icon className="w-4 h-4" />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
