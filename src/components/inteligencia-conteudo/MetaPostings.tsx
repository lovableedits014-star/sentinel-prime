import { lazy } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, Calendar, Clock, Image as ImageIcon, Video, History, PlusCircle } from "lucide-react";

// This will be the main component for the new "Postagens" tab
export default function MetaPostings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Postagens & Agendamento</h2>
          <p className="text-muted-foreground text-sm">
            Crie, agende e gerencie publicações no Facebook e Instagram.
          </p>
        </div>
      </div>

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="create" className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            Nova Postagem
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Agendados
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Criar Publicação</CardTitle>
              <CardDescription>
                Selecione a plataforma e o formato da sua postagem.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 border-2 border-dashed rounded-xl p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Send className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">Módulo de Publicação em Desenvolvimento</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Estamos implementando a interface de criação de posts. Use esta tela para gravar o screencast para o Advanced Access do Meta.
                  </p>
                  <div className="flex gap-3 mt-4">
                    <div className="px-4 py-2 bg-background border rounded-md text-sm font-medium flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" /> Imagem
                    </div>
                    <div className="px-4 py-2 bg-background border rounded-md text-sm font-medium flex items-center gap-2">
                      <Video className="w-4 h-4" /> Vídeo / Reel
                    </div>
                    <div className="px-4 py-2 bg-background border rounded-md text-sm font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Stories
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Publicações Agendadas</CardTitle>
              <CardDescription>Visualize o que está na fila para ser publicado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma publicação agendada no momento.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Publicações</CardTitle>
              <CardDescription>Logs de envios realizados através do sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                O histórico aparecerá após as primeiras publicações.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
