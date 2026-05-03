export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acao_externa_funcionarios: {
        Row: {
          acao_id: string
          cadastros_coletados: number
          client_id: string
          created_at: string
          funcionario_id: string
          id: string
        }
        Insert: {
          acao_id: string
          cadastros_coletados?: number
          client_id: string
          created_at?: string
          funcionario_id: string
          id?: string
        }
        Update: {
          acao_id?: string
          cadastros_coletados?: number
          client_id?: string
          created_at?: string
          funcionario_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acao_externa_funcionarios_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_externas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acao_externa_funcionarios_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acao_externa_funcionarios_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      acoes_externas: {
        Row: {
          cadastros_coletados: number
          client_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          descricao: string | null
          id: string
          local: string | null
          meta_cadastros: number
          status: string
          tag_nome: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cadastros_coletados?: number
          client_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          descricao?: string | null
          id?: string
          local?: string | null
          meta_cadastros?: number
          status?: string
          tag_nome: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cadastros_coletados?: number
          client_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          id?: string
          local?: string | null
          meta_cadastros?: number
          status?: string
          tag_nome?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acoes_externas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      action_logs: {
        Row: {
          action: string
          client_id: string
          created_at: string | null
          details: Json | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          status: string
          user_id: string
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          client_id: string
          created_at: string
          dados: Json | null
          descartado: boolean
          descricao: string | null
          id: string
          lido: boolean
          severidade: string
          tipo: string
          titulo: string
        }
        Insert: {
          client_id: string
          created_at?: string
          dados?: Json | null
          descartado?: boolean
          descricao?: string | null
          id?: string
          lido?: boolean
          severidade?: string
          tipo: string
          titulo: string
        }
        Update: {
          client_id?: string
          created_at?: string
          dados?: Json | null
          descartado?: boolean
          descricao?: string | null
          id?: string
          lido?: boolean
          severidade?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_frames: {
        Row: {
          client_id: string
          composition: Json | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_active: boolean
          kind: string
          nome: string
          updated_at: string
        }
        Insert: {
          client_id: string
          composition?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_active?: boolean
          kind?: string
          nome: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          composition?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_active?: boolean
          kind?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_frames_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_tarefa_items: {
        Row: {
          client_id: string
          concluido: boolean
          created_at: string
          display_order: number
          id: string
          tarefa_id: string
          titulo: string
        }
        Insert: {
          client_id: string
          concluido?: boolean
          created_at?: string
          display_order?: number
          id?: string
          tarefa_id: string
          titulo: string
        }
        Update: {
          client_id?: string
          concluido?: boolean
          created_at?: string
          display_order?: number
          id?: string
          tarefa_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_tarefa_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_tarefa_items_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "campanha_tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_tarefas: {
        Row: {
          campanha_id: string
          client_id: string
          created_at: string
          descricao: string | null
          id: string
          prazo: string | null
          prioridade: string
          responsavel_id: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          campanha_id: string
          client_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          campanha_id?: string
          client_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_tarefas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_tarefas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          client_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          descricao: string | null
          id: string
          meta_principal: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          id?: string
          meta_principal?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          id?: string
          meta_principal?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          cargo: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          presence_absence_days_threshold: number
          presence_absence_message_template: string
          updated_at: string | null
          user_id: string
          whatsapp_bridge_api_key: string | null
          whatsapp_bridge_url: string | null
          whatsapp_inter_instance_delay_max: number
          whatsapp_inter_instance_delay_min: number
          whatsapp_oficial: string | null
          whatsapp_rotation_strategy: string
          whatsapp_window_enabled: boolean
          whatsapp_window_end: string
          whatsapp_window_start: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          presence_absence_days_threshold?: number
          presence_absence_message_template?: string
          updated_at?: string | null
          user_id: string
          whatsapp_bridge_api_key?: string | null
          whatsapp_bridge_url?: string | null
          whatsapp_inter_instance_delay_max?: number
          whatsapp_inter_instance_delay_min?: number
          whatsapp_oficial?: string | null
          whatsapp_rotation_strategy?: string
          whatsapp_window_enabled?: boolean
          whatsapp_window_end?: string
          whatsapp_window_start?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          presence_absence_days_threshold?: number
          presence_absence_message_template?: string
          updated_at?: string | null
          user_id?: string
          whatsapp_bridge_api_key?: string | null
          whatsapp_bridge_url?: string | null
          whatsapp_inter_instance_delay_max?: number
          whatsapp_inter_instance_delay_min?: number
          whatsapp_oficial?: string | null
          whatsapp_rotation_strategy?: string
          whatsapp_window_enabled?: boolean
          whatsapp_window_end?: string
          whatsapp_window_start?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          ai_response: string | null
          author_id: string | null
          author_name: string | null
          author_profile_picture: string | null
          author_unavailable: boolean
          author_unavailable_reason: string | null
          client_id: string
          comment_created_time: string | null
          comment_id: string
          created_at: string | null
          final_response: string | null
          id: string
          is_hidden: boolean
          is_page_owner: boolean
          parent_comment_id: string | null
          platform: string | null
          platform_user_id: string | null
          post_full_picture: string | null
          post_id: string
          post_media_type: string | null
          post_message: string | null
          post_permalink_url: string | null
          responded_at: string | null
          sentiment: Database["public"]["Enums"]["sentiment_type"] | null
          social_profile_id: string | null
          status: Database["public"]["Enums"]["comment_status"] | null
          text: string
          updated_at: string | null
        }
        Insert: {
          ai_response?: string | null
          author_id?: string | null
          author_name?: string | null
          author_profile_picture?: string | null
          author_unavailable?: boolean
          author_unavailable_reason?: string | null
          client_id: string
          comment_created_time?: string | null
          comment_id: string
          created_at?: string | null
          final_response?: string | null
          id?: string
          is_hidden?: boolean
          is_page_owner?: boolean
          parent_comment_id?: string | null
          platform?: string | null
          platform_user_id?: string | null
          post_full_picture?: string | null
          post_id: string
          post_media_type?: string | null
          post_message?: string | null
          post_permalink_url?: string | null
          responded_at?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          social_profile_id?: string | null
          status?: Database["public"]["Enums"]["comment_status"] | null
          text: string
          updated_at?: string | null
        }
        Update: {
          ai_response?: string | null
          author_id?: string | null
          author_name?: string | null
          author_profile_picture?: string | null
          author_unavailable?: boolean
          author_unavailable_reason?: string | null
          client_id?: string
          comment_created_time?: string | null
          comment_id?: string
          created_at?: string | null
          final_response?: string | null
          id?: string
          is_hidden?: boolean
          is_page_owner?: boolean
          parent_comment_id?: string | null
          platform?: string | null
          platform_user_id?: string | null
          post_full_picture?: string | null
          post_id?: string
          post_media_type?: string | null
          post_message?: string | null
          post_permalink_url?: string | null
          responded_at?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"] | null
          social_profile_id?: string | null
          status?: Database["public"]["Enums"]["comment_status"] | null
          text?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_social_profile_id_fkey"
            columns: ["social_profile_id"]
            isOneToOne: false
            referencedRelation: "social_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          client_id: string
          conteudo: string
          created_at: string
          id: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          conteudo: string
          created_at?: string
          id?: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contratado_checkins: {
        Row: {
          checkin_at: string
          checkin_date: string
          client_id: string
          contratado_id: string
          id: string
        }
        Insert: {
          checkin_at?: string
          checkin_date?: string
          client_id: string
          contratado_id: string
          id?: string
        }
        Update: {
          checkin_at?: string
          checkin_date?: string
          client_id?: string
          contratado_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratado_checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratado_checkins_contratado_id_fkey"
            columns: ["contratado_id"]
            isOneToOne: false
            referencedRelation: "contratados"
            referencedColumns: ["id"]
          },
        ]
      }
      contratado_indicados: {
        Row: {
          bairro: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          contratado_id: string
          created_at: string
          endereco: string | null
          id: string
          ligacao_em: string | null
          ligacao_status: string | null
          nome: string
          operador_nome: string | null
          status: string
          telefone: string
          verified_at: string | null
          verified_by: string | null
          vota_candidato: string | null
        }
        Insert: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id: string
          contratado_id: string
          created_at?: string
          endereco?: string | null
          id?: string
          ligacao_em?: string | null
          ligacao_status?: string | null
          nome: string
          operador_nome?: string | null
          status?: string
          telefone: string
          verified_at?: string | null
          verified_by?: string | null
          vota_candidato?: string | null
        }
        Update: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id?: string
          contratado_id?: string
          created_at?: string
          endereco?: string | null
          id?: string
          ligacao_em?: string | null
          ligacao_status?: string | null
          nome?: string
          operador_nome?: string | null
          status?: string
          telefone?: string
          verified_at?: string | null
          verified_by?: string | null
          vota_candidato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratado_indicados_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratado_indicados_contratado_id_fkey"
            columns: ["contratado_id"]
            isOneToOne: false
            referencedRelation: "contratados"
            referencedColumns: ["id"]
          },
        ]
      }
      contratado_missao_dispatches: {
        Row: {
          batch_pause_seconds: number
          batch_size: number
          client_id: string
          completed_at: string | null
          created_at: string
          delay_max_seconds: number
          delay_min_seconds: number
          enviados: number
          falhas: number
          id: string
          link_missao: string | null
          mensagem_template: string
          mission_id: string | null
          started_at: string | null
          status: string
          titulo: string
          total_destinatarios: number
          updated_at: string
        }
        Insert: {
          batch_pause_seconds?: number
          batch_size?: number
          client_id: string
          completed_at?: string | null
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          enviados?: number
          falhas?: number
          id?: string
          link_missao?: string | null
          mensagem_template: string
          mission_id?: string | null
          started_at?: string | null
          status?: string
          titulo: string
          total_destinatarios?: number
          updated_at?: string
        }
        Update: {
          batch_pause_seconds?: number
          batch_size?: number
          client_id?: string
          completed_at?: string | null
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          enviados?: number
          falhas?: number
          id?: string
          link_missao?: string | null
          mensagem_template?: string
          mission_id?: string | null
          started_at?: string | null
          status?: string
          titulo?: string
          total_destinatarios?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratado_missao_dispatches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratado_missao_dispatches_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "portal_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      contratado_missao_items: {
        Row: {
          contratado_id: string
          contratado_nome: string
          created_at: string
          dispatch_id: string
          enviado_em: string | null
          erro: string | null
          id: string
          status: string
          telefone: string
        }
        Insert: {
          contratado_id: string
          contratado_nome: string
          created_at?: string
          dispatch_id: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          status?: string
          telefone: string
        }
        Update: {
          contratado_id?: string
          contratado_nome?: string
          created_at?: string
          dispatch_id?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          status?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratado_missao_items_contratado_id_fkey"
            columns: ["contratado_id"]
            isOneToOne: false
            referencedRelation: "contratados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratado_missao_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "contratado_missao_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      contratados: {
        Row: {
          bairro: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          contrato_aceito: boolean
          contrato_aceito_em: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          is_lider: boolean
          lider_id: string | null
          ligacao_em: string | null
          ligacao_status: string | null
          nome: string
          notas: string | null
          operador_nome: string | null
          presenca_obrigatoria: boolean
          quota_indicados: number
          redes_sociais: Json | null
          secao_eleitoral: string | null
          status: string
          telefone: string
          updated_at: string
          user_id: string | null
          vota_candidato: string | null
          whatsapp_confirmado: boolean
          zona_eleitoral: string | null
        }
        Insert: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id: string
          contrato_aceito?: boolean
          contrato_aceito_em?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          is_lider?: boolean
          lider_id?: string | null
          ligacao_em?: string | null
          ligacao_status?: string | null
          nome: string
          notas?: string | null
          operador_nome?: string | null
          presenca_obrigatoria?: boolean
          quota_indicados?: number
          redes_sociais?: Json | null
          secao_eleitoral?: string | null
          status?: string
          telefone: string
          updated_at?: string
          user_id?: string | null
          vota_candidato?: string | null
          whatsapp_confirmado?: boolean
          zona_eleitoral?: string | null
        }
        Update: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id?: string
          contrato_aceito?: boolean
          contrato_aceito_em?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          is_lider?: boolean
          lider_id?: string | null
          ligacao_em?: string | null
          ligacao_status?: string | null
          nome?: string
          notas?: string | null
          operador_nome?: string | null
          presenca_obrigatoria?: boolean
          quota_indicados?: number
          redes_sociais?: Json | null
          secao_eleitoral?: string | null
          status?: string
          telefone?: string
          updated_at?: string
          user_id?: string | null
          vota_candidato?: string | null
          whatsapp_confirmado?: boolean
          zona_eleitoral?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratados_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratados_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "contratados"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_themes: {
        Row: {
          client_id: string
          created_at: string
          id: string
          keywords: string[]
          label: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          keywords?: string[]
          label: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          keywords?: string[]
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_themes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_items: {
        Row: {
          created_at: string
          dispatch_id: string
          error_message: string | null
          id: string
          platform: string
          platform_user_id: string | null
          sent_at: string | null
          status: string
          supporter_id: string
          supporter_name: string
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          error_message?: string | null
          id?: string
          platform: string
          platform_user_id?: string | null
          sent_at?: string | null
          status?: string
          supporter_id: string
          supporter_name: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          error_message?: string | null
          id?: string
          platform?: string
          platform_user_id?: string | null
          sent_at?: string | null
          status?: string
          supporter_id?: string
          supporter_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "message_dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_actions: {
        Row: {
          action_date: string
          action_type: string
          client_id: string
          comment_id: string | null
          created_at: string
          id: string
          platform: string
          platform_user_id: string | null
          platform_username: string | null
          post_id: string | null
          reaction_type: string | null
          supporter_id: string | null
        }
        Insert: {
          action_date?: string
          action_type: string
          client_id: string
          comment_id?: string | null
          created_at?: string
          id?: string
          platform?: string
          platform_user_id?: string | null
          platform_username?: string | null
          post_id?: string | null
          reaction_type?: string | null
          supporter_id?: string | null
        }
        Update: {
          action_date?: string
          action_type?: string
          client_id?: string
          comment_id?: string | null
          created_at?: string
          id?: string
          platform?: string
          platform_user_id?: string | null
          platform_username?: string | null
          post_id?: string | null
          reaction_type?: string | null
          supporter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_actions_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_config: {
        Row: {
          client_id: string
          comment_points: number
          created_at: string
          id: string
          inactivity_days: number
          like_points: number
          reaction_points: number
          share_points: number
          updated_at: string
        }
        Insert: {
          client_id: string
          comment_points?: number
          created_at?: string
          id?: string
          inactivity_days?: number
          like_points?: number
          reaction_points?: number
          share_points?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          comment_points?: number
          created_at?: string
          id?: string
          inactivity_days?: number
          like_points?: number
          reaction_points?: number
          share_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_score_history: {
        Row: {
          action_count: number
          client_id: string
          created_at: string
          id: string
          month_year: string
          score: number
          supporter_id: string
        }
        Insert: {
          action_count?: number
          client_id: string
          created_at?: string
          id?: string
          month_year: string
          score?: number
          supporter_id: string
        }
        Update: {
          action_count?: number
          client_id?: string
          created_at?: string
          id?: string
          month_year?: string
          score?: number
          supporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_score_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_score_history_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionario_checkins: {
        Row: {
          checkin_at: string
          checkin_date: string
          client_id: string
          funcionario_id: string
          id: string
        }
        Insert: {
          checkin_at?: string
          checkin_date?: string
          client_id: string
          funcionario_id: string
          id?: string
        }
        Update: {
          checkin_at?: string
          checkin_date?: string
          client_id?: string
          funcionario_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funcionario_checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionario_checkins_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionario_referrals: {
        Row: {
          client_id: string
          created_at: string
          funcionario_id: string
          id: string
          pessoa_id: string | null
          referred_name: string
          referred_phone: string | null
          supporter_account_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          funcionario_id: string
          id?: string
          pessoa_id?: string | null
          referred_name: string
          referred_phone?: string | null
          supporter_account_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          funcionario_id?: string
          id?: string
          pessoa_id?: string | null
          referred_name?: string
          referred_phone?: string | null
          supporter_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionario_referrals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionario_referrals_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionario_referrals_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionario_referrals_supporter_account_id_fkey"
            columns: ["supporter_account_id"]
            isOneToOne: false
            referencedRelation: "supporter_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          bairro: string | null
          cidade: string | null
          client_id: string
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          presenca_obrigatoria: boolean
          redes_sociais: Json | null
          referral_code: string
          referral_count: number
          status: string
          supporter_id: string | null
          telefone: string
          updated_at: string
          user_id: string | null
          whatsapp_confirmado: boolean
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          client_id: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          presenca_obrigatoria?: boolean
          redes_sociais?: Json | null
          referral_code?: string
          referral_count?: number
          status?: string
          supporter_id?: string | null
          telefone: string
          updated_at?: string
          user_id?: string | null
          whatsapp_confirmado?: boolean
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          client_id?: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          presenca_obrigatoria?: boolean
          redes_sociais?: Json | null
          referral_code?: string
          referral_count?: number
          status?: string
          supporter_id?: string | null
          telefone?: string
          updated_at?: string
          user_id?: string | null
          whatsapp_confirmado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funcionarios_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      ied_scores: {
        Row: {
          checkin_score: number
          client_id: string
          created_at: string
          details: Json | null
          engagement_score: number
          growth_score: number
          id: string
          score: number
          sentiment_score: number
          week_start: string
        }
        Insert: {
          checkin_score?: number
          client_id: string
          created_at?: string
          details?: Json | null
          engagement_score?: number
          growth_score?: number
          id?: string
          score?: number
          sentiment_score?: number
          week_start: string
        }
        Update: {
          checkin_score?: number
          client_id?: string
          created_at?: string
          details?: Json | null
          engagement_score?: number
          growth_score?: number
          id?: string
          score?: number
          sentiment_score?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ied_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          ai_custom_prompt: string | null
          client_id: string
          created_at: string | null
          id: string
          llm_api_key: string | null
          llm_model: string | null
          llm_provider: Database["public"]["Enums"]["llm_provider"] | null
          meta_access_token: string | null
          meta_instagram_id: string | null
          meta_page_id: string | null
          meta_token_expires_at: string | null
          meta_token_type: string | null
          meta_webhook_url: string | null
          updated_at: string | null
        }
        Insert: {
          ai_custom_prompt?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          llm_api_key?: string | null
          llm_model?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"] | null
          meta_access_token?: string | null
          meta_instagram_id?: string | null
          meta_page_id?: string | null
          meta_token_expires_at?: string | null
          meta_token_type?: string | null
          meta_webhook_url?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_custom_prompt?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          llm_api_key?: string | null
          llm_model?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"] | null
          meta_access_token?: string | null
          meta_instagram_id?: string | null
          meta_page_id?: string | null
          meta_token_expires_at?: string | null
          meta_token_type?: string | null
          meta_webhook_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes_pessoa: {
        Row: {
          client_id: string
          criado_em: string
          criado_por: string
          descricao: string
          id: string
          pessoa_id: string
          tipo_interacao: string
        }
        Insert: {
          client_id: string
          criado_em?: string
          criado_por: string
          descricao: string
          id?: string
          pessoa_id: string
          tipo_interacao: string
        }
        Update: {
          client_id?: string
          criado_em?: string
          criado_por?: string
          descricao?: string
          id?: string
          pessoa_id?: string
          tipo_interacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_pessoa_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_pessoa_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          note: string | null
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          note?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          note?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      lider_invite_tokens: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          note: string | null
          token: string
          used_at: string | null
          used_by_contratado_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          note?: string | null
          token?: string
          used_at?: string | null
          used_by_contratado_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          note?: string | null
          token?: string
          used_at?: string | null
          used_by_contratado_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lider_invite_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lider_invite_tokens_used_by_contratado_id_fkey"
            columns: ["used_by_contratado_id"]
            isOneToOne: false
            referencedRelation: "contratados"
            referencedColumns: ["id"]
          },
        ]
      }
      message_dispatches: {
        Row: {
          batch_delay_seconds: number
          batch_size: number
          cancelled_at: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          failed_count: number
          id: string
          message_delay_max_seconds: number
          message_delay_min_seconds: number
          message_template: string
          post_id: string
          post_permalink_url: string | null
          post_platform: string
          sent_count: number
          started_at: string | null
          status: string
          total_recipients: number
          updated_at: string
        }
        Insert: {
          batch_delay_seconds?: number
          batch_size?: number
          cancelled_at?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          message_delay_max_seconds?: number
          message_delay_min_seconds?: number
          message_template: string
          post_id: string
          post_permalink_url?: string | null
          post_platform?: string
          sent_count?: number
          started_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          batch_delay_seconds?: number
          batch_size?: number
          cancelled_at?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          message_delay_max_seconds?: number
          message_delay_min_seconds?: number
          message_template?: string
          post_id?: string
          post_permalink_url?: string | null
          post_platform?: string
          sent_count?: number
          started_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_dispatches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoa_social: {
        Row: {
          created_at: string
          id: string
          pessoa_id: string
          plataforma: string
          url_perfil: string | null
          usuario: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pessoa_id: string
          plataforma: string
          url_perfil?: string | null
          usuario?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pessoa_id?: string
          plataforma?: string
          url_perfil?: string | null
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_social_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          bairro: string | null
          candidato_alternativo: string | null
          cidade: string | null
          classificacao_politica: string
          client_id: string
          contratado_id: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          id: string
          lider_id: string | null
          nivel_apoio: Database["public"]["Enums"]["nivel_apoio"]
          nome: string
          notas_internas: string | null
          origem_contato: Database["public"]["Enums"]["origem_contato"]
          secao_eleitoral: string | null
          status_lead: string
          supporter_id: string | null
          tags: string[] | null
          telefone: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at: string
          vota_candidato: string | null
          whatsapp_confirmado: boolean
          zona_eleitoral: string | null
        }
        Insert: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          classificacao_politica?: string
          client_id: string
          contratado_id?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          lider_id?: string | null
          nivel_apoio?: Database["public"]["Enums"]["nivel_apoio"]
          nome: string
          notas_internas?: string | null
          origem_contato?: Database["public"]["Enums"]["origem_contato"]
          secao_eleitoral?: string | null
          status_lead?: string
          supporter_id?: string | null
          tags?: string[] | null
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
          vota_candidato?: string | null
          whatsapp_confirmado?: boolean
          zona_eleitoral?: string | null
        }
        Update: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          classificacao_politica?: string
          client_id?: string
          contratado_id?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          lider_id?: string | null
          nivel_apoio?: Database["public"]["Enums"]["nivel_apoio"]
          nome?: string
          notas_internas?: string | null
          origem_contato?: Database["public"]["Enums"]["origem_contato"]
          secao_eleitoral?: string | null
          status_lead?: string
          supporter_id?: string | null
          tags?: string[] | null
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
          vota_candidato?: string | null
          whatsapp_confirmado?: boolean
          zona_eleitoral?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_contratado_id_fkey"
            columns: ["contratado_id"]
            isOneToOne: false
            referencedRelation: "contratados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas_tags: {
        Row: {
          criado_em: string
          id: string
          pessoa_id: string
          tag_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          pessoa_id: string
          tag_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          pessoa_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_tags_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      portal_missions: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          platform: string
          post_url: string
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          platform: string
          post_url: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          platform?: string
          post_url?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_portal_missions_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      presence_absence_notifications: {
        Row: {
          client_id: string
          days_absent: number
          id: string
          person_id: string
          person_name: string
          person_type: string
          sent_at: string
          telefone: string | null
          whatsapp_error: string | null
          whatsapp_status: string
        }
        Insert: {
          client_id: string
          days_absent: number
          id?: string
          person_id: string
          person_name: string
          person_type: string
          sent_at?: string
          telefone?: string | null
          whatsapp_error?: string | null
          whatsapp_status?: string
        }
        Update: {
          client_id?: string
          days_absent?: number
          id?: string
          person_id?: string
          person_name?: string
          person_type?: string
          sent_at?: string
          telefone?: string | null
          whatsapp_error?: string | null
          whatsapp_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_absence_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      push_dispatch_jobs: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          elapsed_seconds: number | null
          error_message: string | null
          expired_removed: number | null
          failed_count: number | null
          id: string
          message: string | null
          sent_count: number | null
          skipped_count: number | null
          started_at: string | null
          status: string
          title: string | null
          total_subscribers: number | null
          url: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          elapsed_seconds?: number | null
          error_message?: string | null
          expired_removed?: number | null
          failed_count?: number | null
          id?: string
          message?: string | null
          sent_count?: number | null
          skipped_count?: number | null
          started_at?: string | null
          status?: string
          title?: string | null
          total_subscribers?: number | null
          url?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          elapsed_seconds?: number | null
          error_message?: string | null
          expired_removed?: number | null
          failed_count?: number | null
          id?: string
          message?: string | null
          sent_count?: number | null
          skipped_count?: number | null
          started_at?: string | null
          status?: string
          title?: string | null
          total_subscribers?: number | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_dispatch_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          client_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          supporter_account_id: string
          updated_at: string
        }
        Insert: {
          auth: string
          client_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          supporter_account_id: string
          updated_at?: string
        }
        Update: {
          auth?: string
          client_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          supporter_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_supporter_account_id_fkey"
            columns: ["supporter_account_id"]
            isOneToOne: false
            referencedRelation: "supporter_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          post_id: string
          reaction_type: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          post_id: string
          reaction_type: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_notification_tokens: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string | null
          frequency: string
          id: string
          last_used_at: string | null
          opted_in_at: string
          platform_user_id: string
          supporter_id: string
          token: string
          token_status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string | null
          frequency?: string
          id?: string
          last_used_at?: string | null
          opted_in_at?: string
          platform_user_id: string
          supporter_id: string
          token: string
          token_status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string | null
          frequency?: string
          id?: string
          last_used_at?: string | null
          opted_in_at?: string
          platform_user_id?: string
          supporter_id?: string
          token?: string
          token_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_notification_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_notification_tokens_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          client_id: string
          code: string
          created_at: string
          id: string
          supporter_account_id: string
        }
        Insert: {
          client_id: string
          code: string
          created_at?: string
          id?: string
          supporter_account_id: string
        }
        Update: {
          client_id?: string
          code?: string
          created_at?: string
          id?: string
          supporter_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_codes_supporter_account_id_fkey"
            columns: ["supporter_account_id"]
            isOneToOne: false
            referencedRelation: "supporter_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          client_id: string
          created_at: string
          id: string
          referred_account_id: string
          referrer_account_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          referred_account_id: string
          referrer_account_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          referred_account_id?: string
          referrer_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_account_id_fkey"
            columns: ["referred_account_id"]
            isOneToOne: false
            referencedRelation: "supporter_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_account_id_fkey"
            columns: ["referrer_account_id"]
            isOneToOne: false
            referencedRelation: "supporter_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_profiles: {
        Row: {
          avatar_url: string | null
          client_id: string
          created_at: string
          display_name: string | null
          id: string
          last_seen: string
          platform: string
          platform_user_id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          client_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen?: string
          platform: string
          platform_user_id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          client_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_seen?: string
          platform?: string
          platform_user_id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_accounts: {
        Row: {
          city: string | null
          client_id: string
          created_at: string
          email: string
          facebook_username: string | null
          id: string
          instagram_username: string | null
          name: string
          neighborhood: string | null
          presenca_obrigatoria: boolean
          referred_by: string | null
          state: string | null
          supporter_id: string | null
          updated_at: string
          user_id: string
          whatsapp_confirmado: boolean
        }
        Insert: {
          city?: string | null
          client_id: string
          created_at?: string
          email: string
          facebook_username?: string | null
          id?: string
          instagram_username?: string | null
          name: string
          neighborhood?: string | null
          presenca_obrigatoria?: boolean
          referred_by?: string | null
          state?: string | null
          supporter_id?: string | null
          updated_at?: string
          user_id: string
          whatsapp_confirmado?: boolean
        }
        Update: {
          city?: string | null
          client_id?: string
          created_at?: string
          email?: string
          facebook_username?: string | null
          id?: string
          instagram_username?: string | null
          name?: string
          neighborhood?: string | null
          presenca_obrigatoria?: boolean
          referred_by?: string | null
          state?: string | null
          supporter_id?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_confirmado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "supporter_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_accounts_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "supporter_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_accounts_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_checkins: {
        Row: {
          checkin_at: string
          checkin_date: string
          client_id: string
          id: string
          supporter_account_id: string
        }
        Insert: {
          checkin_at?: string
          checkin_date?: string
          client_id: string
          id?: string
          supporter_account_id: string
        }
        Update: {
          checkin_at?: string
          checkin_date?: string
          client_id?: string
          id?: string
          supporter_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_checkins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_checkins_supporter_account_id_fkey"
            columns: ["supporter_account_id"]
            isOneToOne: false
            referencedRelation: "supporter_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_profiles: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          platform_user_id: string
          platform_username: string | null
          profile_picture_url: string | null
          supporter_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform: string
          platform_user_id: string
          platform_username?: string | null
          profile_picture_url?: string | null
          supporter_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          platform_user_id?: string
          platform_username?: string | null
          profile_picture_url?: string | null
          supporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_profiles_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      supporters: {
        Row: {
          classification:
            | Database["public"]["Enums"]["supporter_classification"]
            | null
          client_id: string
          created_at: string | null
          engagement_score: number | null
          first_contact_date: string | null
          id: string
          last_interaction_date: string | null
          name: string
          notes: string | null
          referral_count: number
          updated_at: string | null
        }
        Insert: {
          classification?:
            | Database["public"]["Enums"]["supporter_classification"]
            | null
          client_id: string
          created_at?: string | null
          engagement_score?: number | null
          first_contact_date?: string | null
          id?: string
          last_interaction_date?: string | null
          name: string
          notes?: string | null
          referral_count?: number
          updated_at?: string | null
        }
        Update: {
          classification?:
            | Database["public"]["Enums"]["supporter_classification"]
            | null
          client_id?: string
          created_at?: string | null
          engagement_score?: number | null
          first_contact_date?: string | null
          id?: string
          last_interaction_date?: string | null
          name?: string
          notes?: string | null
          referral_count?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supporters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          client_id: string
          criado_em: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          client_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          client_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          client_id: string
          created_at: string | null
          email: string
          id: string
          name: string
          permissions: Json | null
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          email: string
          id?: string
          name: string
          permissions?: Json | null
          role?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          permissions?: Json | null
          role?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      team_supporter_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          notes: string | null
          supporter_id: string
          team_member_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          notes?: string | null
          supporter_id: string
          team_member_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          notes?: string | null
          supporter_id?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_supporter_assignments_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_supporter_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      telemarketing_operadores: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          id: string
          nome: string
          senha: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          id?: string
          nome: string
          senha: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          id?: string
          nome?: string
          senha?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemarketing_operadores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      territorial_zones: {
        Row: {
          client_id: string
          created_at: string
          id: string
          supporter_count: number
          updated_at: string
          zone_name: string
          zone_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          supporter_count?: number
          updated_at?: string
          zone_name: string
          zone_type?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          supporter_count?: number
          updated_at?: string
          zone_name?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "territorial_zones_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_pessoa: {
        Row: {
          client_id: string
          criado_em: string
          criado_por: string
          descricao: string | null
          id: string
          pessoa_id: string
          tipo_evento: string
          titulo: string
        }
        Insert: {
          client_id: string
          criado_em?: string
          criado_por: string
          descricao?: string | null
          id?: string
          pessoa_id: string
          tipo_evento: string
          titulo: string
        }
        Update: {
          client_id?: string
          criado_em?: string
          criado_por?: string
          descricao?: string | null
          id?: string
          pessoa_id?: string
          tipo_evento?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_pessoa_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_pessoa_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_birthday_config: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          hora_envio: string
          id: string
          image_url: string | null
          mensagem_template: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          hora_envio?: string
          id?: string
          image_url?: string | null
          mensagem_template?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          hora_envio?: string
          id?: string
          image_url?: string | null
          mensagem_template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_birthday_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_birthday_log: {
        Row: {
          client_id: string
          enviado_em: string
          erro: string | null
          id: string
          pessoa_id: string
          pessoa_nome: string
          status: string
          telefone: string
        }
        Insert: {
          client_id: string
          enviado_em?: string
          erro?: string | null
          id?: string
          pessoa_id: string
          pessoa_nome: string
          status?: string
          telefone: string
        }
        Update: {
          client_id?: string
          enviado_em?: string
          erro?: string | null
          id?: string
          pessoa_id?: string
          pessoa_nome?: string
          status?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_birthday_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_birthday_log_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_dispatch_items: {
        Row: {
          created_at: string
          dispatch_id: string
          enviado_em: string | null
          erro: string | null
          id: string
          nome: string
          status: string
          telefone: string
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome: string
          status?: string
          telefone: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome?: string
          status?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_dispatch_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_dispatches: {
        Row: {
          batch_pause_seconds: number
          batch_size: number
          client_id: string
          completed_at: string | null
          created_at: string
          delay_max_seconds: number
          delay_min_seconds: number
          enviados: number
          error_message: string | null
          falhas: number
          id: string
          mensagem_template: string
          pause_reason: string | null
          paused_until: string | null
          started_at: string | null
          status: string
          tag_filtro: string | null
          tipo: string
          titulo: string
          total_destinatarios: number
          updated_at: string
        }
        Insert: {
          batch_pause_seconds?: number
          batch_size?: number
          client_id: string
          completed_at?: string | null
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          enviados?: number
          error_message?: string | null
          falhas?: number
          id?: string
          mensagem_template: string
          pause_reason?: string | null
          paused_until?: string | null
          started_at?: string | null
          status?: string
          tag_filtro?: string | null
          tipo?: string
          titulo: string
          total_destinatarios?: number
          updated_at?: string
        }
        Update: {
          batch_pause_seconds?: number
          batch_size?: number
          client_id?: string
          completed_at?: string | null
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          enviados?: number
          error_message?: string | null
          falhas?: number
          id?: string
          mensagem_template?: string
          pause_reason?: string | null
          paused_until?: string | null
          started_at?: string | null
          status?: string
          tag_filtro?: string | null
          tipo?: string
          titulo?: string
          total_destinatarios?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_dispatches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_send_log: {
        Row: {
          client_id: string
          dispatch_id: string | null
          error_message: string | null
          id: string
          instance_id: string
          sent_at: string
          success: boolean
        }
        Insert: {
          client_id: string
          dispatch_id?: string | null
          error_message?: string | null
          id?: string
          instance_id: string
          sent_at?: string
          success: boolean
        }
        Update: {
          client_id?: string
          dispatch_id?: string | null
          error_message?: string | null
          id?: string
          instance_id?: string
          sent_at?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_send_log_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          apelido: string | null
          bridge_api_key: string | null
          bridge_url: string | null
          client_id: string
          connected_since: string | null
          consecutive_failures: number
          created_at: string
          id: string
          instance_name: string | null
          instance_token: string | null
          is_active: boolean
          is_primary: boolean
          last_health_check_at: string | null
          last_send_at: string | null
          messages_sent_today: number
          messages_sent_today_date: string
          notes: string | null
          phone_number: string | null
          qr_code: string | null
          status: string
          total_failed: number
          total_sent: number
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          bridge_api_key?: string | null
          bridge_url?: string | null
          client_id: string
          connected_since?: string | null
          consecutive_failures?: number
          created_at?: string
          id?: string
          instance_name?: string | null
          instance_token?: string | null
          is_active?: boolean
          is_primary?: boolean
          last_health_check_at?: string | null
          last_send_at?: string | null
          messages_sent_today?: number
          messages_sent_today_date?: string
          notes?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          total_failed?: number
          total_sent?: number
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          bridge_api_key?: string | null
          bridge_url?: string | null
          client_id?: string
          connected_since?: string | null
          consecutive_failures?: number
          created_at?: string
          id?: string
          instance_name?: string | null
          instance_token?: string | null
          is_active?: boolean
          is_primary?: boolean
          last_health_check_at?: string | null
          last_send_at?: string | null
          messages_sent_today?: number
          messages_sent_today_date?: string
          notes?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          total_failed?: number
          total_sent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_engagement_score: {
        Args: { p_days?: number; p_supporter_id: string }
        Returns: number
      }
      confirm_whatsapp_by_phone: {
        Args: { p_client_id: string; p_phone: string }
        Returns: Json
      }
      ensure_supporter_for_entity: {
        Args: { p_client_id: string; p_nome: string; p_redes: Json }
        Returns: string
      }
      get_presence_overview: {
        Args: { p_client_id: string }
        Returns: {
          days_since_checkin: number
          email: string
          last_checkin_date: string
          nome: string
          notified_at: string
          person_id: string
          person_type: string
          presenca_obrigatoria: boolean
          telefone: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      link_orphan_engagement_actions: {
        Args: { p_client_id: string }
        Returns: number
      }
      log_whatsapp_send: {
        Args: {
          p_client_id: string
          p_dispatch_id: string
          p_error_message?: string
          p_instance_id: string
          p_success: boolean
        }
        Returns: undefined
      }
      pick_healthy_whatsapp_instance: {
        Args: { p_client_id: string }
        Returns: string
      }
      register_pessoa_public:
        | {
            Args: {
              p_bairro?: string
              p_cidade?: string
              p_client_id: string
              p_email?: string
              p_endereco?: string
              p_nome: string
              p_notas?: string
              p_socials?: Json
              p_telefone: string
              p_tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
            }
            Returns: string
          }
        | {
            Args: {
              p_bairro?: string
              p_cidade?: string
              p_client_id: string
              p_data_nascimento?: string
              p_email?: string
              p_endereco?: string
              p_nome: string
              p_notas?: string
              p_socials?: Json
              p_telefone: string
              p_tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
            }
            Returns: string
          }
      snapshot_monthly_scores: {
        Args: { p_client_id: string }
        Returns: number
      }
      tag_pessoa_acao_externa: {
        Args: {
          p_client_id: string
          p_pessoa_id: string
          p_tag_descricao?: string
          p_tag_nome: string
        }
        Returns: undefined
      }
      whatsapp_phone_variants: { Args: { p_phone: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "client" | "funcionario"
      comment_status: "pending" | "responded" | "ignored"
      llm_provider:
        | "groq"
        | "openai"
        | "anthropic"
        | "gemini"
        | "mistral"
        | "cohere"
      nivel_apoio:
        | "desconhecido"
        | "simpatizante"
        | "apoiador"
        | "militante"
        | "opositor"
      origem_contato:
        | "rede_social"
        | "formulario"
        | "evento"
        | "importacao"
        | "manual"
      sentiment_type: "positive" | "neutral" | "negative"
      supporter_classification:
        | "apoiador_ativo"
        | "apoiador_passivo"
        | "neutro"
        | "critico"
      tipo_pessoa:
        | "eleitor"
        | "apoiador"
        | "lideranca"
        | "jornalista"
        | "influenciador"
        | "voluntario"
        | "adversario"
        | "cidadao"
        | "contratado"
        | "liderado"
        | "indicado"
        | "lider"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "client", "funcionario"],
      comment_status: ["pending", "responded", "ignored"],
      llm_provider: [
        "groq",
        "openai",
        "anthropic",
        "gemini",
        "mistral",
        "cohere",
      ],
      nivel_apoio: [
        "desconhecido",
        "simpatizante",
        "apoiador",
        "militante",
        "opositor",
      ],
      origem_contato: [
        "rede_social",
        "formulario",
        "evento",
        "importacao",
        "manual",
      ],
      sentiment_type: ["positive", "neutral", "negative"],
      supporter_classification: [
        "apoiador_ativo",
        "apoiador_passivo",
        "neutro",
        "critico",
      ],
      tipo_pessoa: [
        "eleitor",
        "apoiador",
        "lideranca",
        "jornalista",
        "influenciador",
        "voluntario",
        "adversario",
        "cidadao",
        "contratado",
        "liderado",
        "indicado",
        "lider",
      ],
    },
  },
} as const
