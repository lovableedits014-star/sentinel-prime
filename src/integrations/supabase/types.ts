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
      ads_accounts: {
        Row: {
          account_status: number | null
          ativa: boolean | null
          business_id: string | null
          business_manager_id: string | null
          business_name: string | null
          candidato_cargo: string | null
          candidato_nome: string | null
          candidato_numero: string | null
          client_id: string
          cnpj_eleitoral: string | null
          created_at: string
          disclaimer_pago_por: string | null
          id: string
          identidade_expira_em: string | null
          identidade_meta_confirmada: boolean | null
          instagram_id: string | null
          meta_ad_account_id: string
          moeda: string | null
          nome: string | null
          page_id: string | null
          pixel_id: string | null
          updated_at: string
        }
        Insert: {
          account_status?: number | null
          ativa?: boolean | null
          business_id?: string | null
          business_manager_id?: string | null
          business_name?: string | null
          candidato_cargo?: string | null
          candidato_nome?: string | null
          candidato_numero?: string | null
          client_id: string
          cnpj_eleitoral?: string | null
          created_at?: string
          disclaimer_pago_por?: string | null
          id?: string
          identidade_expira_em?: string | null
          identidade_meta_confirmada?: boolean | null
          instagram_id?: string | null
          meta_ad_account_id: string
          moeda?: string | null
          nome?: string | null
          page_id?: string | null
          pixel_id?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: number | null
          ativa?: boolean | null
          business_id?: string | null
          business_manager_id?: string | null
          business_name?: string | null
          candidato_cargo?: string | null
          candidato_nome?: string | null
          candidato_numero?: string | null
          client_id?: string
          cnpj_eleitoral?: string | null
          created_at?: string
          disclaimer_pago_por?: string | null
          id?: string
          identidade_expira_em?: string | null
          identidade_meta_confirmada?: boolean | null
          instagram_id?: string | null
          meta_ad_account_id?: string
          moeda?: string | null
          nome?: string | null
          page_id?: string | null
          pixel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_adsets: {
        Row: {
          billing_event: string | null
          campaign_id: string | null
          client_id: string
          created_at: string
          daily_budget_cents: number | null
          end_time: string | null
          id: string
          last_synced_at: string | null
          meta_adset_id: string
          nome: string
          optimization_goal: string | null
          raw_data: Json | null
          start_time: string | null
          status: string | null
          targeting: Json | null
          updated_at: string
        }
        Insert: {
          billing_event?: string | null
          campaign_id?: string | null
          client_id: string
          created_at?: string
          daily_budget_cents?: number | null
          end_time?: string | null
          id?: string
          last_synced_at?: string | null
          meta_adset_id: string
          nome: string
          optimization_goal?: string | null
          raw_data?: Json | null
          start_time?: string | null
          status?: string | null
          targeting?: Json | null
          updated_at?: string
        }
        Update: {
          billing_event?: string | null
          campaign_id?: string | null
          client_id?: string
          created_at?: string
          daily_budget_cents?: number | null
          end_time?: string | null
          id?: string
          last_synced_at?: string | null
          meta_adset_id?: string
          nome?: string
          optimization_goal?: string | null
          raw_data?: Json | null
          start_time?: string | null
          status?: string | null
          targeting?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ads_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_adsets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_ai_suggestions: {
        Row: {
          acao_proposta: Json
          ads_campaign_id: string | null
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          descricao: string
          executed_at: string | null
          execution_result: Json | null
          expires_at: string
          id: string
          impacto_estimado: string | null
          motivo: string | null
          prioridade: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          acao_proposta?: Json
          ads_campaign_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          descricao: string
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          impacto_estimado?: string | null
          motivo?: string | null
          prioridade?: string
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          acao_proposta?: Json
          ads_campaign_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          descricao?: string
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          impacto_estimado?: string | null
          motivo?: string | null
          prioridade?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_ai_suggestions_ads_campaign_id_fkey"
            columns: ["ads_campaign_id"]
            isOneToOne: false
            referencedRelation: "ads_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_ai_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_audit_log: {
        Row: {
          action: string
          client_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_campaigns: {
        Row: {
          ads_account_id: string | null
          client_id: string
          created_at: string
          created_by_user_id: string | null
          daily_budget_cents: number | null
          guard_status: string | null
          id: string
          is_political: boolean | null
          last_synced_at: string | null
          lifetime_budget_cents: number | null
          meta_campaign_id: string
          nome: string
          objetivo: string | null
          raw_data: Json | null
          special_ad_categories: string[] | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
        }
        Insert: {
          ads_account_id?: string | null
          client_id: string
          created_at?: string
          created_by_user_id?: string | null
          daily_budget_cents?: number | null
          guard_status?: string | null
          id?: string
          is_political?: boolean | null
          last_synced_at?: string | null
          lifetime_budget_cents?: number | null
          meta_campaign_id: string
          nome: string
          objetivo?: string | null
          raw_data?: Json | null
          special_ad_categories?: string[] | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Update: {
          ads_account_id?: string | null
          client_id?: string
          created_at?: string
          created_by_user_id?: string | null
          daily_budget_cents?: number | null
          guard_status?: string | null
          id?: string
          is_political?: boolean | null
          last_synced_at?: string | null
          lifetime_budget_cents?: number | null
          meta_campaign_id?: string
          nome?: string
          objetivo?: string | null
          raw_data?: Json | null
          special_ad_categories?: string[] | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_campaigns_ads_account_id_fkey"
            columns: ["ads_account_id"]
            isOneToOne: false
            referencedRelation: "ads_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_creatives: {
        Row: {
          adset_id: string | null
          call_to_action: string | null
          client_id: string
          copy_description: string | null
          copy_headline: string | null
          copy_text: string | null
          created_at: string
          gerado_por_ia: boolean | null
          id: string
          image_url: string | null
          meta_ad_id: string | null
          meta_creative_id: string | null
          nome: string | null
          raw_data: Json | null
          rotulo_ia_aplicado: boolean | null
          status: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          adset_id?: string | null
          call_to_action?: string | null
          client_id: string
          copy_description?: string | null
          copy_headline?: string | null
          copy_text?: string | null
          created_at?: string
          gerado_por_ia?: boolean | null
          id?: string
          image_url?: string | null
          meta_ad_id?: string | null
          meta_creative_id?: string | null
          nome?: string | null
          raw_data?: Json | null
          rotulo_ia_aplicado?: boolean | null
          status?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          adset_id?: string | null
          call_to_action?: string | null
          client_id?: string
          copy_description?: string | null
          copy_headline?: string | null
          copy_text?: string | null
          created_at?: string
          gerado_por_ia?: boolean | null
          id?: string
          image_url?: string | null
          meta_ad_id?: string | null
          meta_creative_id?: string | null
          nome?: string | null
          raw_data?: Json | null
          rotulo_ia_aplicado?: boolean | null
          status?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_creatives_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "ads_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_creatives_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_guard_checks: {
        Row: {
          campaign_id: string | null
          check_categoria_politica: boolean | null
          check_disclaimer: boolean | null
          check_identidade_valida: boolean | null
          check_limite_tse: boolean | null
          check_numero_cargo: boolean | null
          check_periodo: boolean | null
          check_rotulo_ia: boolean | null
          check_sem_adversario: boolean | null
          check_sem_termos_proibidos: boolean | null
          client_id: string
          created_at: string
          creative_id: string | null
          failures: Json | null
          id: string
          passed: boolean
          triggered_by: string | null
          warnings: Json | null
        }
        Insert: {
          campaign_id?: string | null
          check_categoria_politica?: boolean | null
          check_disclaimer?: boolean | null
          check_identidade_valida?: boolean | null
          check_limite_tse?: boolean | null
          check_numero_cargo?: boolean | null
          check_periodo?: boolean | null
          check_rotulo_ia?: boolean | null
          check_sem_adversario?: boolean | null
          check_sem_termos_proibidos?: boolean | null
          client_id: string
          created_at?: string
          creative_id?: string | null
          failures?: Json | null
          id?: string
          passed?: boolean
          triggered_by?: string | null
          warnings?: Json | null
        }
        Update: {
          campaign_id?: string | null
          check_categoria_politica?: boolean | null
          check_disclaimer?: boolean | null
          check_identidade_valida?: boolean | null
          check_limite_tse?: boolean | null
          check_numero_cargo?: boolean | null
          check_periodo?: boolean | null
          check_rotulo_ia?: boolean | null
          check_sem_adversario?: boolean | null
          check_sem_termos_proibidos?: boolean | null
          client_id?: string
          created_at?: string
          creative_id?: string | null
          failures?: Json | null
          id?: string
          passed?: boolean
          triggered_by?: string | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_guard_checks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ads_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_guard_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_guard_checks_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ads_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_identity_status: {
        Row: {
          ad_account_active: boolean | null
          ads_account_id: string | null
          authorized_advertiser_linked: boolean | null
          business_manager_linked: boolean | null
          checked_at: string
          client_id: string
          cnpj_eleitoral_set: boolean | null
          created_at: string
          disclaimer_configured: boolean | null
          has_ads_management: boolean | null
          has_ads_read: boolean | null
          has_business_management: boolean | null
          has_leads_retrieval: boolean | null
          has_pages_manage_ads: boolean | null
          id: string
          issues: Json | null
          overall_status: string | null
          pixel_configured: boolean | null
          political_identity_confirmed: boolean | null
          political_identity_expires_at: string | null
          raw_response: Json | null
        }
        Insert: {
          ad_account_active?: boolean | null
          ads_account_id?: string | null
          authorized_advertiser_linked?: boolean | null
          business_manager_linked?: boolean | null
          checked_at?: string
          client_id: string
          cnpj_eleitoral_set?: boolean | null
          created_at?: string
          disclaimer_configured?: boolean | null
          has_ads_management?: boolean | null
          has_ads_read?: boolean | null
          has_business_management?: boolean | null
          has_leads_retrieval?: boolean | null
          has_pages_manage_ads?: boolean | null
          id?: string
          issues?: Json | null
          overall_status?: string | null
          pixel_configured?: boolean | null
          political_identity_confirmed?: boolean | null
          political_identity_expires_at?: string | null
          raw_response?: Json | null
        }
        Update: {
          ad_account_active?: boolean | null
          ads_account_id?: string | null
          authorized_advertiser_linked?: boolean | null
          business_manager_linked?: boolean | null
          checked_at?: string
          client_id?: string
          cnpj_eleitoral_set?: boolean | null
          created_at?: string
          disclaimer_configured?: boolean | null
          has_ads_management?: boolean | null
          has_ads_read?: boolean | null
          has_business_management?: boolean | null
          has_leads_retrieval?: boolean | null
          has_pages_manage_ads?: boolean | null
          id?: string
          issues?: Json | null
          overall_status?: string | null
          pixel_configured?: boolean | null
          political_identity_confirmed?: boolean | null
          political_identity_expires_at?: string | null
          raw_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_identity_status_ads_account_id_fkey"
            columns: ["ads_account_id"]
            isOneToOne: false
            referencedRelation: "ads_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_identity_status_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_insights_daily: {
        Row: {
          clicks: number | null
          client_id: string
          conversions: number | null
          cpc_cents: number | null
          cpm_cents: number | null
          cpr_cents: number | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          leads: number | null
          level: string
          level_id: string
          raw_data: Json | null
          reach: number | null
          spend_cents: number | null
          synced_at: string
        }
        Insert: {
          clicks?: number | null
          client_id: string
          conversions?: number | null
          cpc_cents?: number | null
          cpm_cents?: number | null
          cpr_cents?: number | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          leads?: number | null
          level: string
          level_id: string
          raw_data?: Json | null
          reach?: number | null
          spend_cents?: number | null
          synced_at?: string
        }
        Update: {
          clicks?: number | null
          client_id?: string
          conversions?: number | null
          cpc_cents?: number | null
          cpm_cents?: number | null
          cpr_cents?: number | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          leads?: number | null
          level?: string
          level_id?: string
          raw_data?: Json | null
          reach?: number | null
          spend_cents?: number | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_insights_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_tse_limits: {
        Row: {
          ano_eleicao: number
          cargo: string
          created_at: string
          id: string
          limite_pre_campanha_cents: number | null
          limite_total_cents: number
          observacoes: string | null
          uf: string | null
        }
        Insert: {
          ano_eleicao: number
          cargo: string
          created_at?: string
          id?: string
          limite_pre_campanha_cents?: number | null
          limite_total_cents: number
          observacoes?: string | null
          uf?: string | null
        }
        Update: {
          ano_eleicao?: number
          cargo?: string
          created_at?: string
          id?: string
          limite_pre_campanha_cents?: number | null
          limite_total_cents?: number
          observacoes?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      adversarios_politicos: {
        Row: {
          ativo: boolean
          cargo: string | null
          client_id: string
          created_at: string
          foto_url: string | null
          id: string
          id_assembleia_estadual: string | null
          id_camara_federal: number | null
          id_senado_federal: number | null
          legislatura_atual: number | null
          municipio: string | null
          nivel: Database["public"]["Enums"]["nivel_parlamentar"]
          nome: string
          nome_parlamentar: string | null
          observacoes: string | null
          partido: string | null
          uf: string | null
          updated_at: string
          url_camara_municipal: string | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          client_id: string
          created_at?: string
          foto_url?: string | null
          id?: string
          id_assembleia_estadual?: string | null
          id_camara_federal?: number | null
          id_senado_federal?: number | null
          legislatura_atual?: number | null
          municipio?: string | null
          nivel: Database["public"]["Enums"]["nivel_parlamentar"]
          nome: string
          nome_parlamentar?: string | null
          observacoes?: string | null
          partido?: string | null
          uf?: string | null
          updated_at?: string
          url_camara_municipal?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          client_id?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          id_assembleia_estadual?: string | null
          id_camara_federal?: number | null
          id_senado_federal?: number | null
          legislatura_atual?: number | null
          municipio?: string | null
          nivel?: Database["public"]["Enums"]["nivel_parlamentar"]
          nome?: string
          nome_parlamentar?: string | null
          observacoes?: string | null
          partido?: string | null
          uf?: string | null
          updated_at?: string
          url_camara_municipal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adversarios_politicos_client_id_fkey"
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
      api_cache: {
        Row: {
          endpoint_key: string
          expires_at: string
          fetched_at: string
          payload: Json
          source: string
        }
        Insert: {
          endpoint_key: string
          expires_at: string
          fetched_at?: string
          payload: Json
          source: string
        }
        Update: {
          endpoint_key?: string
          expires_at?: string
          fetched_at?: string
          payload?: Json
          source?: string
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          author_name: string | null
          avatar_url: string | null
          blocked_at: string
          blocked_by: string | null
          client_id: string
          id: string
          platform: string
          platform_user_id: string
          reason: string | null
        }
        Insert: {
          author_name?: string | null
          avatar_url?: string | null
          blocked_at?: string
          blocked_by?: string | null
          client_id: string
          id?: string
          platform: string
          platform_user_id: string
          reason?: string | null
        }
        Update: {
          author_name?: string | null
          avatar_url?: string | null
          blocked_at?: string
          blocked_by?: string | null
          client_id?: string
          id?: string
          platform?: string
          platform_user_id?: string
          reason?: string | null
        }
        Relationships: []
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
      campaign_materials: {
        Row: {
          client_id: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          download_count: number
          id: string
          kind: string
          mime_type: string
          order_index: number
          public_url: string
          size_bytes: number
          status: string
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          download_count?: number
          id?: string
          kind: string
          mime_type: string
          order_index?: number
          public_url: string
          size_bytes?: number
          status?: string
          storage_path: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          download_count?: number
          id?: string
          kind?: string
          mime_type?: string
          order_index?: number
          public_url?: string
          size_bytes?: number
          status?: string
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_materials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_photo_galleries: {
        Row: {
          client_id: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          enable_auto_logo: boolean | null
          event_date: string | null
          frame_id: string | null
          id: string
          logo_settings: Json | null
          logo_url: string | null
          nome: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          enable_auto_logo?: boolean | null
          event_date?: string | null
          frame_id?: string | null
          id?: string
          logo_settings?: Json | null
          logo_url?: string | null
          nome: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          enable_auto_logo?: boolean | null
          event_date?: string | null
          frame_id?: string | null
          id?: string
          logo_settings?: Json | null
          logo_url?: string | null
          nome?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_photo_galleries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_photo_galleries_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "campaign_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_photo_gallery_items: {
        Row: {
          client_id: string
          created_at: string
          gallery_id: string
          height: number | null
          id: string
          logo_override_settings: Json | null
          order_index: number
          original_file_name: string | null
          public_url: string
          storage_path: string
          width: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          gallery_id: string
          height?: number | null
          id?: string
          logo_override_settings?: Json | null
          order_index?: number
          original_file_name?: string | null
          public_url: string
          storage_path: string
          width?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          gallery_id?: string
          height?: number | null
          id?: string
          logo_override_settings?: Json | null
          order_index?: number
          original_file_name?: string | null
          public_url?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_photo_gallery_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_photo_gallery_items_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "campaign_photo_galleries"
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
      candidate_identity: {
        Row: {
          client_id: string
          created_at: string
          id: string
          logo_path: string | null
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          logo_path?: string | null
          logo_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_identity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_knowledge: {
        Row: {
          aprovado: boolean
          client_id: string
          confidence: number | null
          contexto: string | null
          created_at: string
          document_id: string | null
          entidades: Json | null
          extraction_run_id: string | null
          id: string
          model: string | null
          provider: string | null
          source_date: string | null
          source_id: string | null
          source_type: string
          source_url: string | null
          tema: string | null
          texto: string
          tipo: string
          updated_at: string
        }
        Insert: {
          aprovado?: boolean
          client_id: string
          confidence?: number | null
          contexto?: string | null
          created_at?: string
          document_id?: string | null
          entidades?: Json | null
          extraction_run_id?: string | null
          id?: string
          model?: string | null
          provider?: string | null
          source_date?: string | null
          source_id?: string | null
          source_type: string
          source_url?: string | null
          tema?: string | null
          texto: string
          tipo: string
          updated_at?: string
        }
        Update: {
          aprovado?: boolean
          client_id?: string
          confidence?: number | null
          contexto?: string | null
          created_at?: string
          document_id?: string | null
          entidades?: Json | null
          extraction_run_id?: string | null
          id?: string
          model?: string | null
          provider?: string | null
          source_date?: string | null
          source_id?: string | null
          source_type?: string
          source_url?: string | null
          tema?: string | null
          texto?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_knowledge_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ic_knowledge_documents"
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
          public_base_url: string | null
          public_slug: string | null
          response_ctas: Json
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
          public_base_url?: string | null
          public_slug?: string | null
          response_ctas?: Json
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
          public_base_url?: string | null
          public_slug?: string | null
          response_ctas?: Json
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
          needs_review: boolean
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
          sentiment_confidence: number | null
          sentiment_reason: string | null
          sentiment_source: string
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
          needs_review?: boolean
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
          sentiment_confidence?: number | null
          sentiment_reason?: string | null
          sentiment_source?: string
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
          needs_review?: boolean
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
          sentiment_confidence?: number | null
          sentiment_reason?: string | null
          sentiment_source?: string
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
      content_dna: {
        Row: {
          auto_apply: boolean
          client_id: string
          emojis_assinatura: string[] | null
          estruturas: Json | null
          horarios_pico: Json | null
          sample_size: number | null
          tamanho_ideal: Json | null
          tom: string | null
          updated_at: string
          vocabulario: string[] | null
        }
        Insert: {
          auto_apply?: boolean
          client_id: string
          emojis_assinatura?: string[] | null
          estruturas?: Json | null
          horarios_pico?: Json | null
          sample_size?: number | null
          tamanho_ideal?: Json | null
          tom?: string | null
          updated_at?: string
          vocabulario?: string[] | null
        }
        Update: {
          auto_apply?: boolean
          client_id?: string
          emojis_assinatura?: string[] | null
          estruturas?: Json | null
          horarios_pico?: Json | null
          sample_size?: number | null
          tamanho_ideal?: Json | null
          tom?: string | null
          updated_at?: string
          vocabulario?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "content_dna_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ideas: {
        Row: {
          client_id: string
          created_at: string
          descricao: string | null
          generated_text: Json | null
          id: string
          origem: string | null
          projection: Json | null
          score: number
          source_refs: Json | null
          status: string
          tema: string | null
          tipo: string | null
          titulo: string
          updated_at: string
          user_feedback: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          descricao?: string | null
          generated_text?: Json | null
          id?: string
          origem?: string | null
          projection?: Json | null
          score?: number
          source_refs?: Json | null
          status?: string
          tema?: string | null
          tipo?: string | null
          titulo: string
          updated_at?: string
          user_feedback?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          descricao?: string | null
          generated_text?: Json | null
          id?: string
          origem?: string | null
          projection?: Json | null
          score?: number
          source_refs?: Json | null
          status?: string
          tema?: string | null
          tipo?: string | null
          titulo?: string
          updated_at?: string
          user_feedback?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_radar_snapshots: {
        Row: {
          base_signals: Json | null
          calendar_hooks: Json | null
          client_id: string
          created_at: string
          crisis_alerts: Json | null
          defender_pulse: Json | null
          hostile_narratives: Json | null
          hot_topics: Json | null
          id: string
          meta: Json | null
          mobilizing_pautas: Json | null
          open_questions: Json | null
          snapshot_date: string
          total_signals: number | null
        }
        Insert: {
          base_signals?: Json | null
          calendar_hooks?: Json | null
          client_id: string
          created_at?: string
          crisis_alerts?: Json | null
          defender_pulse?: Json | null
          hostile_narratives?: Json | null
          hot_topics?: Json | null
          id?: string
          meta?: Json | null
          mobilizing_pautas?: Json | null
          open_questions?: Json | null
          snapshot_date?: string
          total_signals?: number | null
        }
        Update: {
          base_signals?: Json | null
          calendar_hooks?: Json | null
          client_id?: string
          created_at?: string
          crisis_alerts?: Json | null
          defender_pulse?: Json | null
          hostile_narratives?: Json | null
          hot_topics?: Json | null
          id?: string
          meta?: Json | null
          mobilizing_pautas?: Json | null
          open_questions?: Json | null
          snapshot_date?: string
          total_signals?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_radar_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          campanha_id: string | null
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
          observacao_tele: string | null
          operador_nome: string | null
          proxima_tentativa_em: string | null
          status: string
          telefone: string
          tentativas_count: number
          verified_at: string | null
          verified_by: string | null
          vota_candidato: string | null
        }
        Insert: {
          bairro?: string | null
          campanha_id?: string | null
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
          observacao_tele?: string | null
          operador_nome?: string | null
          proxima_tentativa_em?: string | null
          status?: string
          telefone: string
          tentativas_count?: number
          verified_at?: string | null
          verified_by?: string | null
          vota_candidato?: string | null
        }
        Update: {
          bairro?: string | null
          campanha_id?: string | null
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
          observacao_tele?: string | null
          operador_nome?: string | null
          proxima_tentativa_em?: string | null
          status?: string
          telefone?: string
          tentativas_count?: number
          verified_at?: string | null
          verified_by?: string | null
          vota_candidato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratado_indicados_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_campanhas"
            referencedColumns: ["id"]
          },
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
          campanha_id: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          contrato_aceito: boolean
          contrato_aceito_em: string | null
          cpf: string | null
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
          observacao_tele: string | null
          operador_nome: string | null
          presenca_obrigatoria: boolean
          proxima_tentativa_em: string | null
          quota_indicados: number
          redes_sociais: Json | null
          secao_eleitoral: string | null
          status: string
          supporter_id: string | null
          telefone: string
          tentativas_count: number
          updated_at: string
          user_id: string | null
          vota_candidato: string | null
          whatsapp_confirmado: boolean
          zona_eleitoral: string | null
        }
        Insert: {
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id: string
          contrato_aceito?: boolean
          contrato_aceito_em?: string | null
          cpf?: string | null
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
          observacao_tele?: string | null
          operador_nome?: string | null
          presenca_obrigatoria?: boolean
          proxima_tentativa_em?: string | null
          quota_indicados?: number
          redes_sociais?: Json | null
          secao_eleitoral?: string | null
          status?: string
          supporter_id?: string | null
          telefone: string
          tentativas_count?: number
          updated_at?: string
          user_id?: string | null
          vota_candidato?: string | null
          whatsapp_confirmado?: boolean
          zona_eleitoral?: string | null
        }
        Update: {
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id?: string
          contrato_aceito?: boolean
          contrato_aceito_em?: string | null
          cpf?: string | null
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
          observacao_tele?: string | null
          operador_nome?: string | null
          presenca_obrigatoria?: boolean
          proxima_tentativa_em?: string | null
          quota_indicados?: number
          redes_sociais?: Json | null
          secao_eleitoral?: string | null
          status?: string
          supporter_id?: string | null
          telefone?: string
          tentativas_count?: number
          updated_at?: string
          user_id?: string | null
          vota_candidato?: string | null
          whatsapp_confirmado?: boolean
          zona_eleitoral?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratados_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_campanhas"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "contratados_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      coringa_conversations: {
        Row: {
          client_id: string
          contexto: Json
          created_at: string
          id: string
          titulo: string | null
          ultima_mensagem_em: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          contexto?: Json
          created_at?: string
          id?: string
          titulo?: string | null
          ultima_mensagem_em?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          contexto?: Json
          created_at?: string
          id?: string
          titulo?: string | null
          ultima_mensagem_em?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coringa_messages: {
        Row: {
          client_id: string
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
        }
        Insert: {
          client_id: string
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Update: {
          client_id?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coringa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coringa_conversations"
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
      disparo_sugestoes: {
        Row: {
          bairro: string | null
          cidade: string | null
          client_id: string
          created_at: string
          destinatarios_filtro: Json | null
          expires_at: string | null
          fonte_knowledge_id: string | null
          fonte_url: string | null
          id: string
          mensagem_sugerida: string
          pessoa_alvo_nome: string | null
          score: number | null
          status: string
          tema: string | null
          tipo: string
          titulo: string
          total_estimado: number | null
          updated_at: string
          whatsapp_dispatch_id: string | null
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          client_id: string
          created_at?: string
          destinatarios_filtro?: Json | null
          expires_at?: string | null
          fonte_knowledge_id?: string | null
          fonte_url?: string | null
          id?: string
          mensagem_sugerida: string
          pessoa_alvo_nome?: string | null
          score?: number | null
          status?: string
          tema?: string | null
          tipo: string
          titulo: string
          total_estimado?: number | null
          updated_at?: string
          whatsapp_dispatch_id?: string | null
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          client_id?: string
          created_at?: string
          destinatarios_filtro?: Json | null
          expires_at?: string | null
          fonte_knowledge_id?: string | null
          fonte_url?: string | null
          id?: string
          mensagem_sugerida?: string
          pessoa_alvo_nome?: string | null
          score?: number | null
          status?: string
          tema?: string | null
          tipo?: string
          titulo?: string
          total_estimado?: number | null
          updated_at?: string
          whatsapp_dispatch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disparo_sugestoes_fonte_knowledge_id_fkey"
            columns: ["fonte_knowledge_id"]
            isOneToOne: false
            referencedRelation: "candidate_knowledge"
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
      eleicao_candidatos_parceiros: {
        Row: {
          ativo: boolean
          cargo: string
          client_id: string
          cor: string
          created_at: string
          foto_url: string | null
          id: string
          nome: string
          numero_urna: string | null
          ordem: number
          partido: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string
          client_id: string
          cor?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome: string
          numero_urna?: string | null
          ordem?: number
          partido?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo?: string
          client_id?: string
          cor?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome?: string
          numero_urna?: string | null
          ordem?: number
          partido?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_candidatos_parceiros_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      eleicao_cobranca_auto_config: {
        Row: {
          ativo: boolean
          cascata: boolean
          client_id: string
          created_at: string
          dias_semana: number[]
          filtro_status: string
          filtro_tipo: string | null
          frequencia: string
          hora_envio: string
          id: string
          janela_horas: number
          max_por_disparo: number
          mensagem_template: string
          proximo_disparo_em: string | null
          ultimo_disparo_em: string | null
          ultimo_resultado: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cascata?: boolean
          client_id: string
          created_at?: string
          dias_semana?: number[]
          filtro_status?: string
          filtro_tipo?: string | null
          frequencia?: string
          hora_envio?: string
          id?: string
          janela_horas?: number
          max_por_disparo?: number
          mensagem_template?: string
          proximo_disparo_em?: string | null
          ultimo_disparo_em?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cascata?: boolean
          client_id?: string
          created_at?: string
          dias_semana?: number[]
          filtro_status?: string
          filtro_tipo?: string | null
          frequencia?: string
          hora_envio?: string
          id?: string
          janela_horas?: number
          max_por_disparo?: number
          mensagem_template?: string
          proximo_disparo_em?: string | null
          ultimo_disparo_em?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_cobranca_auto_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      eleicao_cobranca_log: {
        Row: {
          client_id: string
          created_at: string
          dispatch_id: string | null
          dispatch_item_id: string | null
          enviado_em: string
          id: string
          indicador_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          dispatch_id?: string | null
          dispatch_item_id?: string | null
          enviado_em?: string
          id?: string
          indicador_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          dispatch_id?: string | null
          dispatch_item_id?: string | null
          enviado_em?: string
          id?: string
          indicador_id?: string
        }
        Relationships: []
      }
      eleicao_contato_distribuicoes: {
        Row: {
          client_id: string
          coordenador_id: string
          enviado_em: string
          escopo: string
          id: string
          lote_id: string
          pessoa_id: string
          regiao_key: string
        }
        Insert: {
          client_id: string
          coordenador_id: string
          enviado_em?: string
          escopo: string
          id?: string
          lote_id: string
          pessoa_id: string
          regiao_key: string
        }
        Update: {
          client_id?: string
          coordenador_id?: string
          enviado_em?: string
          escopo?: string
          id?: string
          lote_id?: string
          pessoa_id?: string
          regiao_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_contato_distribuicoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_contato_distribuicoes_coordenador_id_fkey"
            columns: ["coordenador_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_contato_distribuicoes_coordenador_id_fkey"
            columns: ["coordenador_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "eleicao_contato_distribuicoes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "eleicao_contato_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_contato_distribuicoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_contato_distribuicoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
        ]
      }
      eleicao_contato_lotes: {
        Row: {
          apenas_novos: boolean
          canal: string
          client_id: string
          coordenador_id: string
          created_at: string
          criado_por: string | null
          escopo: string
          id: string
          mensagem_enviada: string | null
          observacao: string | null
          regiao_key: string
          regiao_label: string
          status_leitura: string | null
          tag_regiao: string | null
          total_contatos: number
          updated_at: string
          vcf_url: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          apenas_novos?: boolean
          canal: string
          client_id: string
          coordenador_id: string
          created_at?: string
          criado_por?: string | null
          escopo: string
          id?: string
          mensagem_enviada?: string | null
          observacao?: string | null
          regiao_key: string
          regiao_label: string
          status_leitura?: string | null
          tag_regiao?: string | null
          total_contatos?: number
          updated_at?: string
          vcf_url?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          apenas_novos?: boolean
          canal?: string
          client_id?: string
          coordenador_id?: string
          created_at?: string
          criado_por?: string | null
          escopo?: string
          id?: string
          mensagem_enviada?: string | null
          observacao?: string | null
          regiao_key?: string
          regiao_label?: string
          status_leitura?: string | null
          tag_regiao?: string | null
          total_contatos?: number
          updated_at?: string
          vcf_url?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_contato_lotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_contato_lotes_coordenador_id_fkey"
            columns: ["coordenador_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_contato_lotes_coordenador_id_fkey"
            columns: ["coordenador_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
        ]
      }
      eleicao_distribuicao_template: {
        Row: {
          client_id: string
          created_at: string
          id: string
          mensagem_template: string
          tag_prefixo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          mensagem_template?: string
          tag_prefixo?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          mensagem_template?: string
          tag_prefixo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_distribuicao_template_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      eleicao_indicacao_config: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          limite_diario_token: number
          meta_cabo: number
          meta_coordenador: number
          meta_lider: number
          page_botao_label: string | null
          page_funcao_label: string | null
          page_logo_url: string | null
          page_progresso_titulo: string | null
          page_rodape: string | null
          page_saudacao: string | null
          page_subtitulo: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          limite_diario_token?: number
          meta_cabo?: number
          meta_coordenador?: number
          meta_lider?: number
          page_botao_label?: string | null
          page_funcao_label?: string | null
          page_logo_url?: string | null
          page_progresso_titulo?: string | null
          page_rodape?: string | null
          page_saudacao?: string | null
          page_subtitulo?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          limite_diario_token?: number
          meta_cabo?: number
          meta_coordenador?: number
          meta_lider?: number
          page_botao_label?: string | null
          page_funcao_label?: string | null
          page_logo_url?: string | null
          page_progresso_titulo?: string | null
          page_rodape?: string | null
          page_saudacao?: string | null
          page_subtitulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_indicacao_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      eleicao_indicacao_tokens: {
        Row: {
          client_id: string
          created_at: string
          id: string
          indicador_id: string
          revoked_at: string | null
          token: string
          total_indicacoes: number
          ultimo_acesso_em: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          indicador_id: string
          revoked_at?: string | null
          token: string
          total_indicacoes?: number
          ultimo_acesso_em?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          indicador_id?: string
          revoked_at?: string | null
          token?: string
          total_indicacoes?: number
          ultimo_acesso_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_indicacao_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_indicacao_tokens_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_indicacao_tokens_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
        ]
      }
      eleicao_indicados: {
        Row: {
          assigned_operador_id: string | null
          bairro: string | null
          campanha_id: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          created_at: string
          criado_por_user_id: string | null
          id: string
          indicador_id: string
          indicador_tipo: Database["public"]["Enums"]["eleicao_tipo"]
          nome: string
          observacao: string | null
          observacao_tele: string | null
          operador_nome: string | null
          origem: string
          proxima_tentativa_em: string | null
          status_telemarketing: string
          telefone: string
          telefone_norm: string
          token_id: string | null
          total_tentativas: number
          ultima_ligacao_em: string | null
          ultimo_status_ligacao: string | null
          updated_at: string
          vota_candidato: string | null
        }
        Insert: {
          assigned_operador_id?: string | null
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id: string
          created_at?: string
          criado_por_user_id?: string | null
          id?: string
          indicador_id: string
          indicador_tipo: Database["public"]["Enums"]["eleicao_tipo"]
          nome: string
          observacao?: string | null
          observacao_tele?: string | null
          operador_nome?: string | null
          origem?: string
          proxima_tentativa_em?: string | null
          status_telemarketing?: string
          telefone: string
          telefone_norm: string
          token_id?: string | null
          total_tentativas?: number
          ultima_ligacao_em?: string | null
          ultimo_status_ligacao?: string | null
          updated_at?: string
          vota_candidato?: string | null
        }
        Update: {
          assigned_operador_id?: string | null
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id?: string
          created_at?: string
          criado_por_user_id?: string | null
          id?: string
          indicador_id?: string
          indicador_tipo?: Database["public"]["Enums"]["eleicao_tipo"]
          nome?: string
          observacao?: string | null
          observacao_tele?: string | null
          operador_nome?: string | null
          origem?: string
          proxima_tentativa_em?: string | null
          status_telemarketing?: string
          telefone?: string
          telefone_norm?: string
          token_id?: string | null
          total_tentativas?: number
          ultima_ligacao_em?: string | null
          ultimo_status_ligacao?: string | null
          updated_at?: string
          vota_candidato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_indicados_assigned_operador_id_fkey"
            columns: ["assigned_operador_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_indicados_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_indicados_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_indicados_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_indicados_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "eleicao_indicados_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "eleicao_indicacao_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_indicados_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["token_id"]
          },
        ]
      }
      eleicao_notif_config: {
        Row: {
          auto_enviar: boolean
          cadastro_cabo_ativo: boolean
          cadastro_lider_ativo: boolean
          cadastro_voluntario_ativo: boolean
          client_id: string
          created_at: string
          envio_cabo_boas_vindas_ativo: boolean
          envio_coord_boas_vindas_ativo: boolean
          envio_coordenador_ativo: boolean
          envio_lider_ativo: boolean
          grupos_jids: Json
          grupos_links: Json
          id: string
          secretaria_telefone: string | null
          template_cabo_boas_vindas: string | null
          template_coordenador: string
          template_coordenador_boas_vindas: string | null
          template_lider: string
          updated_at: string
        }
        Insert: {
          auto_enviar?: boolean
          cadastro_cabo_ativo?: boolean
          cadastro_lider_ativo?: boolean
          cadastro_voluntario_ativo?: boolean
          client_id: string
          created_at?: string
          envio_cabo_boas_vindas_ativo?: boolean
          envio_coord_boas_vindas_ativo?: boolean
          envio_coordenador_ativo?: boolean
          envio_lider_ativo?: boolean
          grupos_jids?: Json
          grupos_links?: Json
          id?: string
          secretaria_telefone?: string | null
          template_cabo_boas_vindas?: string | null
          template_coordenador?: string
          template_coordenador_boas_vindas?: string | null
          template_lider?: string
          updated_at?: string
        }
        Update: {
          auto_enviar?: boolean
          cadastro_cabo_ativo?: boolean
          cadastro_lider_ativo?: boolean
          cadastro_voluntario_ativo?: boolean
          client_id?: string
          created_at?: string
          envio_cabo_boas_vindas_ativo?: boolean
          envio_coord_boas_vindas_ativo?: boolean
          envio_coordenador_ativo?: boolean
          envio_lider_ativo?: boolean
          grupos_jids?: Json
          grupos_links?: Json
          id?: string
          secretaria_telefone?: string | null
          template_cabo_boas_vindas?: string | null
          template_coordenador?: string
          template_coordenador_boas_vindas?: string | null
          template_lider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_notif_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      eleicao_notif_log: {
        Row: {
          bridge_status: number | null
          client_id: string
          created_at: string
          destinatario_nome: string | null
          destinatario_telefone: string | null
          destinatario_tipo: string
          error_message: string | null
          id: string
          mensagem: string | null
          message_id: string | null
          pessoa_id: string | null
          preflight_status: string | null
          skipped_reason: string | null
          success: boolean
        }
        Insert: {
          bridge_status?: number | null
          client_id: string
          created_at?: string
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          destinatario_tipo: string
          error_message?: string | null
          id?: string
          mensagem?: string | null
          message_id?: string | null
          pessoa_id?: string | null
          preflight_status?: string | null
          skipped_reason?: string | null
          success?: boolean
        }
        Update: {
          bridge_status?: number | null
          client_id?: string
          created_at?: string
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          destinatario_tipo?: string
          error_message?: string | null
          id?: string
          mensagem?: string | null
          message_id?: string | null
          pessoa_id?: string | null
          preflight_status?: string | null
          skipped_reason?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_notif_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_notif_log_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_notif_log_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
        ]
      }
      eleicao_pessoa_grupo_status: {
        Row: {
          client_id: string
          entrou_visto_em: string | null
          group_jid: string | null
          pessoa_id: string
          saiu_visto_em: string | null
          status: string
          verificado_em: string
        }
        Insert: {
          client_id: string
          entrou_visto_em?: string | null
          group_jid?: string | null
          pessoa_id: string
          saiu_visto_em?: string | null
          status: string
          verificado_em?: string
        }
        Update: {
          client_id?: string
          entrou_visto_em?: string | null
          group_jid?: string | null
          pessoa_id?: string
          saiu_visto_em?: string | null
          status?: string
          verificado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_pessoa_grupo_status_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoa_grupo_status_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
        ]
      }
      eleicao_pessoas: {
        Row: {
          assigned_operador_id: string | null
          bairro: string | null
          campanha_id: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          confirmado_em: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string
          escopo: Database["public"]["Enums"]["eleicao_escopo"]
          funcionario_id: string | null
          geocode_endereco_hash: string | null
          geocode_precision: string | null
          geocode_status: string | null
          geocoded_at: string | null
          id: string
          is_favorito_regiao: boolean
          is_voluntario: boolean
          lat: number | null
          ligacao_em: string | null
          ligacao_status: string | null
          lng: number | null
          nome: string
          numero: string | null
          observacao_tele: string | null
          observacoes: string | null
          operador_nome: string | null
          parceiro_id: string | null
          parent_id: string | null
          participou_reuniao: boolean | null
          pode_cadastrar_cabo: boolean
          pode_cadastrar_lider: boolean
          pre_selecionado: boolean | null
          proxima_tentativa_em: string | null
          rateio_estadual: number
          rateio_parceiro: number
          regiao: string | null
          reuniao_em: string | null
          rua: string | null
          status_contratacao: string | null
          supporter_id: string | null
          telefone: string
          tentativas_count: number
          tipo: Database["public"]["Enums"]["eleicao_tipo"]
          updated_at: string
          user_id: string | null
          valor_contratacao: number
          voluntario_marcado_em: string | null
          voluntario_obs: string | null
          vota_candidato: string | null
        }
        Insert: {
          assigned_operador_id?: string | null
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco: string
          escopo: Database["public"]["Enums"]["eleicao_escopo"]
          funcionario_id?: string | null
          geocode_endereco_hash?: string | null
          geocode_precision?: string | null
          geocode_status?: string | null
          geocoded_at?: string | null
          id?: string
          is_favorito_regiao?: boolean
          is_voluntario?: boolean
          lat?: number | null
          ligacao_em?: string | null
          ligacao_status?: string | null
          lng?: number | null
          nome: string
          numero?: string | null
          observacao_tele?: string | null
          observacoes?: string | null
          operador_nome?: string | null
          parceiro_id?: string | null
          parent_id?: string | null
          participou_reuniao?: boolean | null
          pode_cadastrar_cabo?: boolean
          pode_cadastrar_lider?: boolean
          pre_selecionado?: boolean | null
          proxima_tentativa_em?: string | null
          rateio_estadual?: number
          rateio_parceiro?: number
          regiao?: string | null
          reuniao_em?: string | null
          rua?: string | null
          status_contratacao?: string | null
          supporter_id?: string | null
          telefone: string
          tentativas_count?: number
          tipo: Database["public"]["Enums"]["eleicao_tipo"]
          updated_at?: string
          user_id?: string | null
          valor_contratacao?: number
          voluntario_marcado_em?: string | null
          voluntario_obs?: string | null
          vota_candidato?: string | null
        }
        Update: {
          assigned_operador_id?: string | null
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id?: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string
          escopo?: Database["public"]["Enums"]["eleicao_escopo"]
          funcionario_id?: string | null
          geocode_endereco_hash?: string | null
          geocode_precision?: string | null
          geocode_status?: string | null
          geocoded_at?: string | null
          id?: string
          is_favorito_regiao?: boolean
          is_voluntario?: boolean
          lat?: number | null
          ligacao_em?: string | null
          ligacao_status?: string | null
          lng?: number | null
          nome?: string
          numero?: string | null
          observacao_tele?: string | null
          observacoes?: string | null
          operador_nome?: string | null
          parceiro_id?: string | null
          parent_id?: string | null
          participou_reuniao?: boolean | null
          pode_cadastrar_cabo?: boolean
          pode_cadastrar_lider?: boolean
          pre_selecionado?: boolean | null
          proxima_tentativa_em?: string | null
          rateio_estadual?: number
          rateio_parceiro?: number
          regiao?: string | null
          reuniao_em?: string | null
          rua?: string | null
          status_contratacao?: string | null
          supporter_id?: string | null
          telefone?: string
          tentativas_count?: number
          tipo?: Database["public"]["Enums"]["eleicao_tipo"]
          updated_at?: string
          user_id?: string | null
          valor_contratacao?: number
          voluntario_marcado_em?: string | null
          voluntario_obs?: string | null
          vota_candidato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_pessoas_assigned_operador_id_fkey"
            columns: ["assigned_operador_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "eleicao_candidatos_parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "supporters"
            referencedColumns: ["id"]
          },
        ]
      }
      eleicao_regioes: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          escopo: string
          id: string
          label: string
          ordem: number
          tag: string | null
          updated_at: string
          value: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          escopo?: string
          id?: string
          label: string
          ordem?: number
          tag?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          escopo?: string
          id?: string
          label?: string
          ordem?: number
          tag?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_regioes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      engagement_autoresolve_config: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          frequency: string
          hour_utc: number
          id: string
          last_run_at: string | null
          last_run_message: string | null
          last_run_status: string | null
          relink_orphans: boolean
          resolve_invalid_ids: boolean
          updated_at: string
          weekday: number
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          frequency?: string
          hour_utc?: number
          id?: string
          last_run_at?: string | null
          last_run_message?: string | null
          last_run_status?: string | null
          relink_orphans?: boolean
          resolve_invalid_ids?: boolean
          updated_at?: string
          weekday?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          frequency?: string
          hour_utc?: number
          id?: string
          last_run_at?: string | null
          last_run_message?: string | null
          last_run_status?: string | null
          relink_orphans?: boolean
          resolve_invalid_ids?: boolean
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "engagement_autoresolve_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_autoresolve_runs: {
        Row: {
          client_id: string
          id: string
          linked_count: number
          message: string | null
          ran_at: string
          resolved_count: number
          status: string
          triggered_by: string
        }
        Insert: {
          client_id: string
          id?: string
          linked_count?: number
          message?: string | null
          ran_at?: string
          resolved_count?: number
          status: string
          triggered_by?: string
        }
        Update: {
          client_id?: string
          id?: string
          linked_count?: number
          message?: string | null
          ran_at?: string
          resolved_count?: number
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_autoresolve_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      engagement_metas: {
        Row: {
          cargo: string
          client_id: string
          created_at: string
          id: string
          min_interacoes: number
          min_missoes: number
          periodo_dias: number
          updated_at: string
        }
        Insert: {
          cargo: string
          client_id: string
          created_at?: string
          id?: string
          min_interacoes?: number
          min_missoes?: number
          periodo_dias?: number
          updated_at?: string
        }
        Update: {
          cargo?: string
          client_id?: string
          created_at?: string
          id?: string
          min_interacoes?: number
          min_missoes?: number
          periodo_dias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_metas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
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
          cpf: string | null
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
          cpf?: string | null
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
          cpf?: string | null
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
      ic_document_contradictions: {
        Row: {
          client_id: string
          created_at: string
          detected_at: string
          document_a_id: string
          document_b_id: string
          explicacao: string
          id: string
          severidade: string
          status: string
          tema: string | null
          tipo: string | null
          trecho_a: string | null
          trecho_b: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          detected_at?: string
          document_a_id: string
          document_b_id: string
          explicacao: string
          id?: string
          severidade?: string
          status?: string
          tema?: string | null
          tipo?: string | null
          trecho_a?: string | null
          trecho_b?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          detected_at?: string
          document_a_id?: string
          document_b_id?: string
          explicacao?: string
          id?: string
          severidade?: string
          status?: string
          tema?: string | null
          tipo?: string | null
          trecho_a?: string | null
          trecho_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ic_document_contradictions_document_a_id_fkey"
            columns: ["document_a_id"]
            isOneToOne: false
            referencedRelation: "ic_knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ic_document_contradictions_document_b_id_fkey"
            columns: ["document_b_id"]
            isOneToOne: false
            referencedRelation: "ic_knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ic_drift_analyses: {
        Row: {
          client_id: string
          created_at: string
          descricao: string
          documentos_analisados: number
          exemplos: Json
          id: string
          metadata: Json
          periodo_fim: string
          periodo_inicio: string
          severidade: string
          status: string
          tema: string
          tipo_mudanca: string
          titulo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          descricao: string
          documentos_analisados?: number
          exemplos?: Json
          id?: string
          metadata?: Json
          periodo_fim: string
          periodo_inicio: string
          severidade?: string
          status?: string
          tema: string
          tipo_mudanca?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          descricao?: string
          documentos_analisados?: number
          exemplos?: Json
          id?: string
          metadata?: Json
          periodo_fim?: string
          periodo_inicio?: string
          severidade?: string
          status?: string
          tema?: string
          tipo_mudanca?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ic_drift_analyses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ic_knowledge_documents: {
        Row: {
          adversarios_citados: Json
          audio_url: string | null
          bairros_citados: Json
          bandeiras: Json
          bordoes: Json
          client_id: string
          created_at: string
          created_by: string | null
          data_evento: string | null
          duracao_sec: number | null
          embedded_at: string | null
          embedding: string | null
          embedding_model: string | null
          extraction_run_id: string | null
          id: string
          local: string | null
          model: string | null
          numeros_e_dados: Json
          pessoas_citadas: Json
          pontos_principais: Json
          promessas: Json
          propostas: Json
          provider: string | null
          resumo_executivo: string | null
          source_ref: string | null
          source_url: string | null
          status: string
          tags: string[]
          texto_integral: string
          tipo_documento: string
          titulo: string
          tom_emocional: string | null
          transcription_id: string | null
          updated_at: string
        }
        Insert: {
          adversarios_citados?: Json
          audio_url?: string | null
          bairros_citados?: Json
          bandeiras?: Json
          bordoes?: Json
          client_id: string
          created_at?: string
          created_by?: string | null
          data_evento?: string | null
          duracao_sec?: number | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          extraction_run_id?: string | null
          id?: string
          local?: string | null
          model?: string | null
          numeros_e_dados?: Json
          pessoas_citadas?: Json
          pontos_principais?: Json
          promessas?: Json
          propostas?: Json
          provider?: string | null
          resumo_executivo?: string | null
          source_ref?: string | null
          source_url?: string | null
          status?: string
          tags?: string[]
          texto_integral: string
          tipo_documento?: string
          titulo: string
          tom_emocional?: string | null
          transcription_id?: string | null
          updated_at?: string
        }
        Update: {
          adversarios_citados?: Json
          audio_url?: string | null
          bairros_citados?: Json
          bandeiras?: Json
          bordoes?: Json
          client_id?: string
          created_at?: string
          created_by?: string | null
          data_evento?: string | null
          duracao_sec?: number | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          extraction_run_id?: string | null
          id?: string
          local?: string | null
          model?: string | null
          numeros_e_dados?: Json
          pessoas_citadas?: Json
          pontos_principais?: Json
          promessas?: Json
          propostas?: Json
          provider?: string | null
          resumo_executivo?: string | null
          source_ref?: string | null
          source_url?: string | null
          status?: string
          tags?: string[]
          texto_integral?: string
          tipo_documento?: string
          titulo?: string
          tom_emocional?: string | null
          transcription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ic_knowledge_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ic_knowledge_documents_transcription_id_fkey"
            columns: ["transcription_id"]
            isOneToOne: false
            referencedRelation: "ic_transcriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      ic_memoria_insights: {
        Row: {
          acao_url: string | null
          client_id: string
          created_at: string
          dados: Json
          descricao: string
          id: string
          prioridade: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          acao_url?: string | null
          client_id: string
          created_at?: string
          dados?: Json
          descricao: string
          id?: string
          prioridade?: string
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          acao_url?: string | null
          client_id?: string
          created_at?: string
          dados?: Json
          descricao?: string
          id?: string
          prioridade?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ic_memoria_insights_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ic_promessas: {
        Row: {
          bairro: string | null
          beneficiario: string | null
          client_id: string
          created_at: string
          documento_origem_id: string | null
          evidencias: Json
          id: string
          notas: string | null
          prazo_data: string | null
          prazo_texto: string | null
          status: string
          texto: string
          tipo: string
          transcription_id: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          beneficiario?: string | null
          client_id: string
          created_at?: string
          documento_origem_id?: string | null
          evidencias?: Json
          id?: string
          notas?: string | null
          prazo_data?: string | null
          prazo_texto?: string | null
          status?: string
          texto: string
          tipo?: string
          transcription_id?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          beneficiario?: string | null
          client_id?: string
          created_at?: string
          documento_origem_id?: string | null
          evidencias?: Json
          id?: string
          notas?: string | null
          prazo_data?: string | null
          prazo_texto?: string | null
          status?: string
          texto?: string
          tipo?: string
          transcription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ic_promessas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ic_promessas_documento_origem_id_fkey"
            columns: ["documento_origem_id"]
            isOneToOne: false
            referencedRelation: "ic_knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ic_promessas_transcription_id_fkey"
            columns: ["transcription_id"]
            isOneToOne: false
            referencedRelation: "ic_transcriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      ic_transcriptions: {
        Row: {
          client_id: string
          created_at: string
          duration_sec: number | null
          filename: string
          full_text: string | null
          id: string
          language: string | null
          model: string | null
          segments: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          duration_sec?: number | null
          filename: string
          full_text?: string | null
          id?: string
          language?: string | null
          model?: string | null
          segments?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          duration_sec?: number | null
          filename?: string
          full_text?: string | null
          id?: string
          language?: string | null
          model?: string | null
          segments?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
          ai_prompt_logica_comportamental: string | null
          ai_prompt_regras_estruturais: string | null
          ai_prompt_restricoes: string | null
          ai_prompt_tom_voz: string | null
          client_id: string
          created_at: string | null
          id: string
          llm_api_key: string | null
          llm_api_key_classify: string | null
          llm_api_key_deep: string | null
          llm_api_key_fast: string | null
          llm_api_key_reasoning: string | null
          llm_mode: string
          llm_model: string | null
          llm_model_classify: string | null
          llm_model_deep: string | null
          llm_model_fast: string | null
          llm_model_reasoning: string | null
          llm_provider: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_classify:
            | Database["public"]["Enums"]["llm_provider"]
            | null
          llm_provider_deep: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_fast: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_reasoning:
            | Database["public"]["Enums"]["llm_provider"]
            | null
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
          ai_prompt_logica_comportamental?: string | null
          ai_prompt_regras_estruturais?: string | null
          ai_prompt_restricoes?: string | null
          ai_prompt_tom_voz?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          llm_api_key?: string | null
          llm_api_key_classify?: string | null
          llm_api_key_deep?: string | null
          llm_api_key_fast?: string | null
          llm_api_key_reasoning?: string | null
          llm_mode?: string
          llm_model?: string | null
          llm_model_classify?: string | null
          llm_model_deep?: string | null
          llm_model_fast?: string | null
          llm_model_reasoning?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_classify?:
            | Database["public"]["Enums"]["llm_provider"]
            | null
          llm_provider_deep?: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_fast?: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_reasoning?:
            | Database["public"]["Enums"]["llm_provider"]
            | null
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
          ai_prompt_logica_comportamental?: string | null
          ai_prompt_regras_estruturais?: string | null
          ai_prompt_restricoes?: string | null
          ai_prompt_tom_voz?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          llm_api_key?: string | null
          llm_api_key_classify?: string | null
          llm_api_key_deep?: string | null
          llm_api_key_fast?: string | null
          llm_api_key_reasoning?: string | null
          llm_mode?: string
          llm_model?: string | null
          llm_model_classify?: string | null
          llm_model_deep?: string | null
          llm_model_fast?: string | null
          llm_model_reasoning?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_classify?:
            | Database["public"]["Enums"]["llm_provider"]
            | null
          llm_provider_deep?: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_fast?: Database["public"]["Enums"]["llm_provider"] | null
          llm_provider_reasoning?:
            | Database["public"]["Enums"]["llm_provider"]
            | null
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
      legacy_password_recovery_allowlist: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          used_at?: string | null
          user_id?: string
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
      llm_alert_rules: {
        Row: {
          alert_type: string
          client_id: string | null
          created_at: string
          debounce_minutes: number
          enabled: boolean
          id: string
          severity: string
          threshold: number
          updated_at: string
          window_minutes: number
        }
        Insert: {
          alert_type: string
          client_id?: string | null
          created_at?: string
          debounce_minutes?: number
          enabled?: boolean
          id?: string
          severity?: string
          threshold: number
          updated_at?: string
          window_minutes?: number
        }
        Update: {
          alert_type?: string
          client_id?: string | null
          created_at?: string
          debounce_minutes?: number
          enabled?: boolean
          id?: string
          severity?: string
          threshold?: number
          updated_at?: string
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "llm_alert_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          client_id: string | null
          context: Json
          created_at: string
          id: string
          message: string | null
          observed_value: number | null
          resolved_at: string | null
          severity: string
          status: string
          threshold: number | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          client_id?: string | null
          context?: Json
          created_at?: string
          id?: string
          message?: string | null
          observed_value?: number | null
          resolved_at?: string | null
          severity?: string
          status?: string
          threshold?: number | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          client_id?: string | null
          context?: Json
          created_at?: string
          id?: string
          message?: string | null
          observed_value?: number | null
          resolved_at?: string | null
          severity?: string
          status?: string
          threshold?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage_log: {
        Row: {
          client_id: string
          completion_tokens: number | null
          correlation_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          error_type: string | null
          estimated_cost_usd: number | null
          function_name: string
          id: string
          latency_ms: number | null
          model: string
          parent_function: string | null
          prompt_tokens: number | null
          provider: string
          request_id: string
          retries: number
          success: boolean
          tier: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          client_id: string
          completion_tokens?: number | null
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          error_type?: string | null
          estimated_cost_usd?: number | null
          function_name: string
          id?: string
          latency_ms?: number | null
          model: string
          parent_function?: string | null
          prompt_tokens?: number | null
          provider: string
          request_id: string
          retries?: number
          success: boolean
          tier: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          client_id?: string
          completion_tokens?: number | null
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          error_type?: string | null
          estimated_cost_usd?: number | null
          function_name?: string
          id?: string
          latency_ms?: number | null
          model?: string
          parent_function?: string | null
          prompt_tokens?: number | null
          provider?: string
          request_id?: string
          retries?: number
          success?: boolean
          tier?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      materias_geradas: {
        Row: {
          client_id: string
          corpo: string
          created_at: string
          fontes: Json
          id: string
          metadata: Json
          model: string | null
          prompt_input: string | null
          provider: string | null
          status: string
          subtitulo: string | null
          tema: string | null
          tipo: string
          titulo: string
          tom: string | null
          transcription_id: string | null
          updated_at: string
          user_id: string | null
          versao: number
        }
        Insert: {
          client_id: string
          corpo: string
          created_at?: string
          fontes?: Json
          id?: string
          metadata?: Json
          model?: string | null
          prompt_input?: string | null
          provider?: string | null
          status?: string
          subtitulo?: string | null
          tema?: string | null
          tipo?: string
          titulo: string
          tom?: string | null
          transcription_id?: string | null
          updated_at?: string
          user_id?: string | null
          versao?: number
        }
        Update: {
          client_id?: string
          corpo?: string
          created_at?: string
          fontes?: Json
          id?: string
          metadata?: Json
          model?: string | null
          prompt_input?: string | null
          provider?: string | null
          status?: string
          subtitulo?: string | null
          tema?: string | null
          tipo?: string
          titulo?: string
          tom?: string | null
          transcription_id?: string | null
          updated_at?: string
          user_id?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "materias_geradas_transcription_id_fkey"
            columns: ["transcription_id"]
            isOneToOne: false
            referencedRelation: "ic_transcriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      materias_versions: {
        Row: {
          client_id: string
          corpo: string
          created_at: string
          fontes: Json
          id: string
          materia_id: string
          metadata: Json
          model: string | null
          prompt_input: string | null
          provider: string | null
          subtitulo: string | null
          titulo: string
          versao: number
        }
        Insert: {
          client_id: string
          corpo: string
          created_at?: string
          fontes?: Json
          id?: string
          materia_id: string
          metadata?: Json
          model?: string | null
          prompt_input?: string | null
          provider?: string | null
          subtitulo?: string | null
          titulo: string
          versao: number
        }
        Update: {
          client_id?: string
          corpo?: string
          created_at?: string
          fontes?: Json
          id?: string
          materia_id?: string
          metadata?: Json
          model?: string | null
          prompt_input?: string | null
          provider?: string | null
          subtitulo?: string | null
          titulo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "materias_versions_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias_geradas"
            referencedColumns: ["id"]
          },
        ]
      }
      media_alert_events: {
        Row: {
          avg_tone: number | null
          client_id: string
          created_at: string
          growth_pct: number | null
          id: string
          is_read: boolean
          negative_ratio: number | null
          negatives: number
          neutrals: number
          positives: number
          previous_articles: number | null
          query_snapshot: string | null
          read_at: string | null
          read_by: string | null
          rule_id: string
          rule_name: string
          sample_articles: Json | null
          severity: string
          total_articles: number
          trigger_kind: string
          triggered_at: string
        }
        Insert: {
          avg_tone?: number | null
          client_id: string
          created_at?: string
          growth_pct?: number | null
          id?: string
          is_read?: boolean
          negative_ratio?: number | null
          negatives?: number
          neutrals?: number
          positives?: number
          previous_articles?: number | null
          query_snapshot?: string | null
          read_at?: string | null
          read_by?: string | null
          rule_id: string
          rule_name: string
          sample_articles?: Json | null
          severity?: string
          total_articles?: number
          trigger_kind: string
          triggered_at?: string
        }
        Update: {
          avg_tone?: number | null
          client_id?: string
          created_at?: string
          growth_pct?: number | null
          id?: string
          is_read?: boolean
          negative_ratio?: number | null
          negatives?: number
          neutrals?: number
          positives?: number
          previous_articles?: number | null
          query_snapshot?: string | null
          read_at?: string | null
          read_by?: string | null
          rule_id?: string
          rule_name?: string
          sample_articles?: Json | null
          severity?: string
          total_articles?: number
          trigger_kind?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_alert_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_alert_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "media_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      media_alert_rules: {
        Row: {
          alert_type: string
          client_id: string
          cooldown_minutes: number
          country: string
          created_at: string
          description: string | null
          domains: string[] | null
          exclude_terms: string[] | null
          id: string
          is_active: boolean
          keywords: string[]
          language: string | null
          last_checked_at: string | null
          last_triggered_at: string | null
          min_volume: number
          municipio: string | null
          name: string
          negative_ratio_threshold: number
          negative_tone_threshold: number
          timespan: string
          uf: string | null
          updated_at: string
          volume_growth_pct: number
        }
        Insert: {
          alert_type?: string
          client_id: string
          cooldown_minutes?: number
          country?: string
          created_at?: string
          description?: string | null
          domains?: string[] | null
          exclude_terms?: string[] | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          language?: string | null
          last_checked_at?: string | null
          last_triggered_at?: string | null
          min_volume?: number
          municipio?: string | null
          name: string
          negative_ratio_threshold?: number
          negative_tone_threshold?: number
          timespan?: string
          uf?: string | null
          updated_at?: string
          volume_growth_pct?: number
        }
        Update: {
          alert_type?: string
          client_id?: string
          cooldown_minutes?: number
          country?: string
          created_at?: string
          description?: string | null
          domains?: string[] | null
          exclude_terms?: string[] | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          language?: string | null
          last_checked_at?: string | null
          last_triggered_at?: string | null
          min_volume?: number
          municipio?: string | null
          name?: string
          negative_ratio_threshold?: number
          negative_tone_threshold?: number
          timespan?: string
          uf?: string | null
          updated_at?: string
          volume_growth_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_alert_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      media_saved_searches: {
        Row: {
          client_id: string
          country: string
          created_at: string
          id: string
          municipio: string | null
          name: string
          terms: Json
          timespan: string
          uf: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          country?: string
          created_at?: string
          id?: string
          municipio?: string | null
          name: string
          terms?: Json
          timespan?: string
          uf?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          country?: string
          created_at?: string
          id?: string
          municipio?: string | null
          name?: string
          terms?: Json
          timespan?: string
          uf?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_saved_searches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      meta_scheduled_posts: {
        Row: {
          client_id: string
          content: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          media_urls: string[] | null
          meta_id: string | null
          platform: string
          post_type: string
          scheduled_for: string
          status: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          media_urls?: string[] | null
          meta_id?: string | null
          platform: string
          post_type: string
          scheduled_for: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          media_urls?: string[] | null
          meta_id?: string | null
          platform?: string
          post_type?: string
          scheduled_for?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_scheduled_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      midia_alvos_monitoramento: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          id: string
          termo: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          id?: string
          termo: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          id?: string
          termo?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "midia_alvos_monitoramento_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      midia_coleta_log: {
        Row: {
          client_id: string
          creditos_firecrawl: number | null
          erros: Json | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          noticias_analisadas: number | null
          noticias_novas: number | null
          portais_processados: number | null
          status: string
        }
        Insert: {
          client_id: string
          creditos_firecrawl?: number | null
          erros?: Json | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          noticias_analisadas?: number | null
          noticias_novas?: number | null
          portais_processados?: number | null
          status?: string
        }
        Update: {
          client_id?: string
          creditos_firecrawl?: number | null
          erros?: Json | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          noticias_analisadas?: number | null
          noticias_novas?: number | null
          portais_processados?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "midia_coleta_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      midia_noticias: {
        Row: {
          alerta_critico: boolean
          alvos_mencionados: string[] | null
          client_id: string
          conteudo_md: string | null
          created_at: string
          data_coleta: string
          data_publicacao: string | null
          id: string
          portal_id: string | null
          portal_nome: string | null
          raw_metadata: Json | null
          relevancia_politica: number | null
          resumo: string | null
          resumo_ia: string | null
          sentimento: string | null
          sentimento_score: number | null
          tags_assunto: string[] | null
          titulo: string
          url: string
        }
        Insert: {
          alerta_critico?: boolean
          alvos_mencionados?: string[] | null
          client_id: string
          conteudo_md?: string | null
          created_at?: string
          data_coleta?: string
          data_publicacao?: string | null
          id?: string
          portal_id?: string | null
          portal_nome?: string | null
          raw_metadata?: Json | null
          relevancia_politica?: number | null
          resumo?: string | null
          resumo_ia?: string | null
          sentimento?: string | null
          sentimento_score?: number | null
          tags_assunto?: string[] | null
          titulo: string
          url: string
        }
        Update: {
          alerta_critico?: boolean
          alvos_mencionados?: string[] | null
          client_id?: string
          conteudo_md?: string | null
          created_at?: string
          data_coleta?: string
          data_publicacao?: string | null
          id?: string
          portal_id?: string | null
          portal_nome?: string | null
          raw_metadata?: Json | null
          relevancia_politica?: number | null
          resumo?: string | null
          resumo_ia?: string | null
          sentimento?: string | null
          sentimento_score?: number | null
          tags_assunto?: string[] | null
          titulo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "midia_noticias_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "midia_noticias_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "midia_portais"
            referencedColumns: ["id"]
          },
        ]
      }
      midia_portais: {
        Row: {
          ativo: boolean
          camada: string
          created_at: string
          id: string
          municipio: string | null
          nome: string
          observacoes: string | null
          ordem: number
          uf: string | null
          updated_at: string
          url: string
        }
        Insert: {
          ativo?: boolean
          camada?: string
          created_at?: string
          id?: string
          municipio?: string | null
          nome: string
          observacoes?: string | null
          ordem?: number
          uf?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          ativo?: boolean
          camada?: string
          created_at?: string
          id?: string
          municipio?: string | null
          nome?: string
          observacoes?: string | null
          ordem?: number
          uf?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      mission_distributions: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          dispatch_id: string | null
          group_jid: string | null
          group_name_snapshot: string | null
          id: string
          mission_id: string | null
          short_code: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          dispatch_id?: string | null
          group_jid?: string | null
          group_name_snapshot?: string | null
          id?: string
          mission_id?: string | null
          short_code: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          dispatch_id?: string | null
          group_jid?: string | null
          group_name_snapshot?: string | null
          id?: string
          mission_id?: string | null
          short_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_distributions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "portal_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_events: {
        Row: {
          client_id: string
          created_at: string
          device_category: string | null
          distribution_group_snapshot: string | null
          distribution_id: string | null
          event_type: Database["public"]["Enums"]["mission_event_type"]
          id: string
          ip_hash: string | null
          is_bot: boolean
          mission_id: string | null
          mission_title_snapshot: string | null
          participant_id: string | null
          user_agent: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          device_category?: string | null
          distribution_group_snapshot?: string | null
          distribution_id?: string | null
          event_type: Database["public"]["Enums"]["mission_event_type"]
          id?: string
          ip_hash?: string | null
          is_bot?: boolean
          mission_id?: string | null
          mission_title_snapshot?: string | null
          participant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          device_category?: string | null
          distribution_group_snapshot?: string | null
          distribution_id?: string | null
          event_type?: Database["public"]["Enums"]["mission_event_type"]
          id?: string
          ip_hash?: string | null
          is_bot?: boolean
          mission_id?: string | null
          mission_title_snapshot?: string | null
          participant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_events_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "mission_distributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "portal_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_events_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_participants: {
        Row: {
          client_id: string
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          nome: string
          pessoa_id: string | null
          phone_e164: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          nome: string
          pessoa_id?: string | null
          phone_e164: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          nome?: string
          pessoa_id?: string | null
          phone_e164?: string
          updated_at?: string
        }
        Relationships: []
      }
      mission_visitor_tokens: {
        Row: {
          client_id: string
          created_at: string
          device_hint: string | null
          last_distribution_id: string | null
          last_used_at: string
          participant_id: string
          revoked_at: string | null
          token: string
          user_agent: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          device_hint?: string | null
          last_distribution_id?: string | null
          last_used_at?: string
          participant_id: string
          revoked_at?: string | null
          token: string
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          device_hint?: string | null
          last_distribution_id?: string | null
          last_used_at?: string
          participant_id?: string
          revoked_at?: string | null
          token?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_visitor_tokens_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      municipios_indicadores: {
        Row: {
          cobertura_sus_pct: number | null
          codigo_ibge: number
          created_at: string
          datasus_ano: number | null
          id: string
          ideb_ano: number | null
          ideb_anos_finais: number | null
          ideb_anos_iniciais: number | null
          ideb_ensino_medio: number | null
          idh: number | null
          idh_ano: number | null
          indicadores: Json | null
          leitos_sus_total: number | null
          mortalidade_infantil: number | null
          nome: string
          num_escolas: number | null
          pib_ano: number | null
          pib_per_capita: number | null
          pib_total: number | null
          populacao: number | null
          populacao_ano: number | null
          renda_media: number | null
          uf: string
          ultima_atualizacao: string
        }
        Insert: {
          cobertura_sus_pct?: number | null
          codigo_ibge: number
          created_at?: string
          datasus_ano?: number | null
          id?: string
          ideb_ano?: number | null
          ideb_anos_finais?: number | null
          ideb_anos_iniciais?: number | null
          ideb_ensino_medio?: number | null
          idh?: number | null
          idh_ano?: number | null
          indicadores?: Json | null
          leitos_sus_total?: number | null
          mortalidade_infantil?: number | null
          nome: string
          num_escolas?: number | null
          pib_ano?: number | null
          pib_per_capita?: number | null
          pib_total?: number | null
          populacao?: number | null
          populacao_ano?: number | null
          renda_media?: number | null
          uf: string
          ultima_atualizacao?: string
        }
        Update: {
          cobertura_sus_pct?: number | null
          codigo_ibge?: number
          created_at?: string
          datasus_ano?: number | null
          id?: string
          ideb_ano?: number | null
          ideb_anos_finais?: number | null
          ideb_anos_iniciais?: number | null
          ideb_ensino_medio?: number | null
          idh?: number | null
          idh_ano?: number | null
          indicadores?: Json | null
          leitos_sus_total?: number | null
          mortalidade_infantil?: number | null
          nome?: string
          num_escolas?: number | null
          pib_ano?: number | null
          pib_per_capita?: number | null
          pib_total?: number | null
          populacao?: number | null
          populacao_ano?: number | null
          renda_media?: number | null
          uf?: string
          ultima_atualizacao?: string
        }
        Relationships: []
      }
      municipios_sync_log: {
        Row: {
          created_at: string
          duracao_ms: number | null
          erro_mensagem: string | null
          fonte: string
          id: string
          municipios_processados: number | null
          status: string
        }
        Insert: {
          created_at?: string
          duracao_ms?: number | null
          erro_mensagem?: string | null
          fonte: string
          id?: string
          municipios_processados?: number | null
          status: string
        }
        Update: {
          created_at?: string
          duracao_ms?: number | null
          erro_mensagem?: string | null
          fonte?: string
          id?: string
          municipios_processados?: number | null
          status?: string
        }
        Relationships: []
      }
      narrativa_dossies: {
        Row: {
          analise: Json
          analyzed_at: string | null
          client_id: string
          collected_at: string | null
          conteudos: Json
          created_at: string
          created_by: string | null
          dados_brutos: Json
          erro_msg: string | null
          generated_at: string | null
          ibge_code: string | null
          id: string
          municipio: string
          status: string
          uf: string
          updated_at: string
        }
        Insert: {
          analise?: Json
          analyzed_at?: string | null
          client_id: string
          collected_at?: string | null
          conteudos?: Json
          created_at?: string
          created_by?: string | null
          dados_brutos?: Json
          erro_msg?: string | null
          generated_at?: string | null
          ibge_code?: string | null
          id?: string
          municipio: string
          status?: string
          uf: string
          updated_at?: string
        }
        Update: {
          analise?: Json
          analyzed_at?: string | null
          client_id?: string
          collected_at?: string | null
          conteudos?: Json
          created_at?: string
          created_by?: string | null
          dados_brutos?: Json
          erro_msg?: string | null
          generated_at?: string | null
          ibge_code?: string | null
          id?: string
          municipio?: string
          status?: string
          uf?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrativa_dossies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      narrativa_perfil_candidato: {
        Row: {
          bandeiras: Json
          cargo_pretendido: string | null
          client_id: string
          created_at: string
          estilo_discurso: string | null
          id: string
          nome_candidato: string | null
          observacoes: string | null
          partido: string | null
          proposta_central: string | null
          publico_alvo: string | null
          ref_ano: number | null
          ref_cargo: string | null
          ref_lado: string | null
          ref_municipio: string | null
          ref_nome: string | null
          ref_partido: string | null
          ref_uf: string | null
          tom_voz: string | null
          updated_at: string
        }
        Insert: {
          bandeiras?: Json
          cargo_pretendido?: string | null
          client_id: string
          created_at?: string
          estilo_discurso?: string | null
          id?: string
          nome_candidato?: string | null
          observacoes?: string | null
          partido?: string | null
          proposta_central?: string | null
          publico_alvo?: string | null
          ref_ano?: number | null
          ref_cargo?: string | null
          ref_lado?: string | null
          ref_municipio?: string | null
          ref_nome?: string | null
          ref_partido?: string | null
          ref_uf?: string | null
          tom_voz?: string | null
          updated_at?: string
        }
        Update: {
          bandeiras?: Json
          cargo_pretendido?: string | null
          client_id?: string
          created_at?: string
          estilo_discurso?: string | null
          id?: string
          nome_candidato?: string | null
          observacoes?: string | null
          partido?: string | null
          proposta_central?: string | null
          publico_alvo?: string | null
          ref_ano?: number | null
          ref_cargo?: string | null
          ref_lado?: string | null
          ref_municipio?: string | null
          ref_nome?: string | null
          ref_partido?: string | null
          ref_uf?: string | null
          tom_voz?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrativa_perfil_candidato_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      narrativa_visitas_realizadas: {
        Row: {
          bairros_visitados: Json
          client_id: string
          created_at: string
          created_by: string | null
          data_visita: string
          dossie_id: string | null
          id: string
          municipio: string
          observacoes: string | null
          resultado_percebido: string | null
          temas_abordados: Json
          uf: string
          updated_at: string
        }
        Insert: {
          bairros_visitados?: Json
          client_id: string
          created_at?: string
          created_by?: string | null
          data_visita?: string
          dossie_id?: string | null
          id?: string
          municipio: string
          observacoes?: string | null
          resultado_percebido?: string | null
          temas_abordados?: Json
          uf: string
          updated_at?: string
        }
        Update: {
          bairros_visitados?: Json
          client_id?: string
          created_at?: string
          created_by?: string | null
          data_visita?: string
          dossie_id?: string | null
          id?: string
          municipio?: string
          observacoes?: string | null
          resultado_percebido?: string | null
          temas_abordados?: Json
          uf?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrativa_visitas_realizadas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrativa_visitas_realizadas_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "narrativa_dossies"
            referencedColumns: ["id"]
          },
        ]
      }
      parlamentar_presenca: {
        Row: {
          adversario_id: string
          client_id: string
          created_at: string
          data_sessao: string
          id: string
          id_externo: string | null
          justificada: boolean
          legislatura: number | null
          motivo_ausencia: string | null
          presente: boolean
          tipo_sessao: string | null
        }
        Insert: {
          adversario_id: string
          client_id: string
          created_at?: string
          data_sessao: string
          id?: string
          id_externo?: string | null
          justificada?: boolean
          legislatura?: number | null
          motivo_ausencia?: string | null
          presente: boolean
          tipo_sessao?: string | null
        }
        Update: {
          adversario_id?: string
          client_id?: string
          created_at?: string
          data_sessao?: string
          id?: string
          id_externo?: string | null
          justificada?: boolean
          legislatura?: number | null
          motivo_ausencia?: string | null
          presente?: boolean
          tipo_sessao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parlamentar_presenca_adversario_id_fkey"
            columns: ["adversario_id"]
            isOneToOne: false
            referencedRelation: "adversarios_politicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parlamentar_presenca_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      parlamentar_proposicoes: {
        Row: {
          adversario_id: string
          ano: number | null
          client_id: string
          created_at: string
          data_apresentacao: string | null
          ementa: string | null
          id: string
          id_externo: string | null
          numero: string | null
          situacao: string | null
          tema: string | null
          tipo: string
          url_detalhes: string | null
        }
        Insert: {
          adversario_id: string
          ano?: number | null
          client_id: string
          created_at?: string
          data_apresentacao?: string | null
          ementa?: string | null
          id?: string
          id_externo?: string | null
          numero?: string | null
          situacao?: string | null
          tema?: string | null
          tipo: string
          url_detalhes?: string | null
        }
        Update: {
          adversario_id?: string
          ano?: number | null
          client_id?: string
          created_at?: string
          data_apresentacao?: string | null
          ementa?: string | null
          id?: string
          id_externo?: string | null
          numero?: string | null
          situacao?: string | null
          tema?: string | null
          tipo?: string
          url_detalhes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parlamentar_proposicoes_adversario_id_fkey"
            columns: ["adversario_id"]
            isOneToOne: false
            referencedRelation: "adversarios_politicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parlamentar_proposicoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      parlamentar_sync_log: {
        Row: {
          adversario_id: string | null
          client_id: string
          created_at: string
          duracao_ms: number | null
          erro_mensagem: string | null
          fonte: string
          id: string
          registros_atualizados: number | null
          registros_inseridos: number | null
          status: string
          tipo_dado: string
        }
        Insert: {
          adversario_id?: string | null
          client_id: string
          created_at?: string
          duracao_ms?: number | null
          erro_mensagem?: string | null
          fonte: string
          id?: string
          registros_atualizados?: number | null
          registros_inseridos?: number | null
          status: string
          tipo_dado: string
        }
        Update: {
          adversario_id?: string | null
          client_id?: string
          created_at?: string
          duracao_ms?: number | null
          erro_mensagem?: string | null
          fonte?: string
          id?: string
          registros_atualizados?: number | null
          registros_inseridos?: number | null
          status?: string
          tipo_dado?: string
        }
        Relationships: [
          {
            foreignKeyName: "parlamentar_sync_log_adversario_id_fkey"
            columns: ["adversario_id"]
            isOneToOne: false
            referencedRelation: "adversarios_politicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parlamentar_sync_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      parlamentar_votacoes: {
        Row: {
          adversario_id: string
          client_id: string
          created_at: string
          data_votacao: string
          id: string
          id_externo: string | null
          proposicao_codigo: string | null
          proposicao_ementa: string | null
          resultado_geral: string | null
          tema: string | null
          url_detalhes: string | null
          voto: string
        }
        Insert: {
          adversario_id: string
          client_id: string
          created_at?: string
          data_votacao: string
          id?: string
          id_externo?: string | null
          proposicao_codigo?: string | null
          proposicao_ementa?: string | null
          resultado_geral?: string | null
          tema?: string | null
          url_detalhes?: string | null
          voto: string
        }
        Update: {
          adversario_id?: string
          client_id?: string
          created_at?: string
          data_votacao?: string
          id?: string
          id_externo?: string | null
          proposicao_codigo?: string | null
          proposicao_ementa?: string | null
          resultado_geral?: string | null
          tema?: string | null
          url_detalhes?: string | null
          voto?: string
        }
        Relationships: [
          {
            foreignKeyName: "parlamentar_votacoes_adversario_id_fkey"
            columns: ["adversario_id"]
            isOneToOne: false
            referencedRelation: "adversarios_politicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parlamentar_votacoes_client_id_fkey"
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
          cpf: string | null
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
          cpf?: string | null
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
          cpf?: string | null
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
      platform_users: {
        Row: {
          allowed_paths: string[]
          created_at: string
          created_by: string | null
          email: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_paths?: string[]
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_paths?: string[]
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portal_missions: {
        Row: {
          archived_at: string | null
          client_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          instructions: string | null
          is_active: boolean
          link_avulso: string | null
          link_facebook: string | null
          link_instagram: string | null
          platform: string
          post_url: string
          title: string | null
          tracking_enabled: boolean
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          instructions?: string | null
          is_active?: boolean
          link_avulso?: string | null
          link_facebook?: string | null
          link_instagram?: string | null
          platform: string
          post_url: string
          title?: string | null
          tracking_enabled?: boolean
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          instructions?: string | null
          is_active?: boolean
          link_avulso?: string | null
          link_facebook?: string | null
          link_instagram?: string | null
          platform?: string
          post_url?: string
          title?: string | null
          tracking_enabled?: boolean
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
      quick_contacts: {
        Row: {
          client_id: string
          context_message: string | null
          created_at: string
          display_order: number
          id: string
          label: string
          phone: string
          updated_at: string
        }
        Insert: {
          client_id: string
          context_message?: string | null
          created_at?: string
          display_order?: number
          id?: string
          label: string
          phone: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          context_message?: string | null
          created_at?: string
          display_order?: number
          id?: string
          label?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      reuniao_inscricoes: {
        Row: {
          checkin_em: string | null
          created_at: string
          eleicao_pessoa_id: string | null
          id: string
          link_id: string | null
          nome: string
          presenca: string | null
          reuniao_id: string
          sessao_id: string
          status: string
          telefone: string
          updated_at: string
        }
        Insert: {
          checkin_em?: string | null
          created_at?: string
          eleicao_pessoa_id?: string | null
          id?: string
          link_id?: string | null
          nome: string
          presenca?: string | null
          reuniao_id: string
          sessao_id: string
          status?: string
          telefone: string
          updated_at?: string
        }
        Update: {
          checkin_em?: string | null
          created_at?: string
          eleicao_pessoa_id?: string | null
          id?: string
          link_id?: string | null
          nome?: string
          presenca?: string | null
          reuniao_id?: string
          sessao_id?: string
          status?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reuniao_inscricoes_eleicao_pessoa_id_fkey"
            columns: ["eleicao_pessoa_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reuniao_inscricoes_eleicao_pessoa_id_fkey"
            columns: ["eleicao_pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "reuniao_inscricoes_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "reuniao_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reuniao_inscricoes_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "reunioes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reuniao_inscricoes_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "reuniao_sessoes"
            referencedColumns: ["id"]
          },
        ]
      }
      reuniao_links: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          label: string
          reuniao_id: string
          token: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          label: string
          reuniao_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          label?: string
          reuniao_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reuniao_links_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      reuniao_sessoes: {
        Row: {
          created_at: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          label: string
          ordem: number
          reuniao_id: string
          updated_at: string
          vagas: number
        }
        Insert: {
          created_at?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          label: string
          ordem?: number
          reuniao_id: string
          updated_at?: string
          vagas?: number
        }
        Update: {
          created_at?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          label?: string
          ordem?: number
          reuniao_id?: string
          updated_at?: string
          vagas?: number
        }
        Relationships: [
          {
            foreignKeyName: "reuniao_sessoes_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      reunioes: {
        Row: {
          client_id: string
          created_at: string
          data_reuniao: string
          id: string
          local: string | null
          observacoes: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          data_reuniao: string
          id?: string
          local?: string | null
          observacoes?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          data_reuniao?: string
          id?: string
          local?: string | null
          observacoes?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reunioes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          at: string
          client_id: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          target_user_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          at?: string
          client_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          at?: string
          client_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sentiment_corrections: {
        Row: {
          ai_predicted: string | null
          ai_reason: string | null
          client_id: string
          comment_id: string | null
          comment_text: string
          corrected_by: string | null
          created_at: string
          human_corrected: string
          id: string
          post_stance: string | null
        }
        Insert: {
          ai_predicted?: string | null
          ai_reason?: string | null
          client_id: string
          comment_id?: string | null
          comment_text: string
          corrected_by?: string | null
          created_at?: string
          human_corrected: string
          id?: string
          post_stance?: string | null
        }
        Update: {
          ai_predicted?: string | null
          ai_reason?: string | null
          client_id?: string
          comment_id?: string | null
          comment_text?: string
          corrected_by?: string | null
          created_at?: string
          human_corrected?: string
          id?: string
          post_stance?: string | null
        }
        Relationships: []
      }
      social_militants: {
        Row: {
          author_name: string | null
          avatar_url: string | null
          client_id: string
          created_at: string
          current_badge: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          notes: string | null
          platform: string
          platform_user_id: string
          platform_username: string | null
          promoted_to_supporter_id: string | null
          total_30d_negative: number
          total_30d_positive: number
          total_comments: number
          total_negative: number
          total_neutral: number
          total_positive: number
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          avatar_url?: string | null
          client_id: string
          created_at?: string
          current_badge?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notes?: string | null
          platform: string
          platform_user_id: string
          platform_username?: string | null
          promoted_to_supporter_id?: string | null
          total_30d_negative?: number
          total_30d_positive?: number
          total_comments?: number
          total_negative?: number
          total_neutral?: number
          total_positive?: number
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          avatar_url?: string | null
          client_id?: string
          created_at?: string
          current_badge?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notes?: string | null
          platform?: string
          platform_user_id?: string
          platform_username?: string | null
          promoted_to_supporter_id?: string | null
          total_30d_negative?: number
          total_30d_positive?: number
          total_comments?: number
          total_negative?: number
          total_neutral?: number
          total_positive?: number
          updated_at?: string
        }
        Relationships: []
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
          birth_date: string | null
          city: string | null
          client_id: string
          cpf: string | null
          created_at: string
          email: string
          endereco: string | null
          facebook_username: string | null
          id: string
          instagram_username: string | null
          legacy_password_recovery_allowed: boolean
          name: string
          neighborhood: string | null
          phone: string | null
          presenca_obrigatoria: boolean
          referred_by: string | null
          state: string | null
          supporter_id: string | null
          updated_at: string
          user_id: string
          whatsapp_confirmado: boolean
        }
        Insert: {
          birth_date?: string | null
          city?: string | null
          client_id: string
          cpf?: string | null
          created_at?: string
          email: string
          endereco?: string | null
          facebook_username?: string | null
          id?: string
          instagram_username?: string | null
          legacy_password_recovery_allowed?: boolean
          name: string
          neighborhood?: string | null
          phone?: string | null
          presenca_obrigatoria?: boolean
          referred_by?: string | null
          state?: string | null
          supporter_id?: string | null
          updated_at?: string
          user_id: string
          whatsapp_confirmado?: boolean
        }
        Update: {
          birth_date?: string | null
          city?: string | null
          client_id?: string
          cpf?: string | null
          created_at?: string
          email?: string
          endereco?: string | null
          facebook_username?: string | null
          id?: string
          instagram_username?: string | null
          legacy_password_recovery_allowed?: boolean
          name?: string
          neighborhood?: string | null
          phone?: string | null
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
          bairro: string | null
          birth_date: string | null
          cidade: string | null
          classification:
            | Database["public"]["Enums"]["supporter_classification"]
            | null
          client_id: string
          cpf: string | null
          created_at: string | null
          endereco: string | null
          engagement_score: number | null
          first_contact_date: string | null
          id: string
          last_interaction_date: string | null
          name: string
          notes: string | null
          referral_count: number
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          bairro?: string | null
          birth_date?: string | null
          cidade?: string | null
          classification?:
            | Database["public"]["Enums"]["supporter_classification"]
            | null
          client_id: string
          cpf?: string | null
          created_at?: string | null
          endereco?: string | null
          engagement_score?: number | null
          first_contact_date?: string | null
          id?: string
          last_interaction_date?: string | null
          name: string
          notes?: string | null
          referral_count?: number
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          bairro?: string | null
          birth_date?: string | null
          cidade?: string | null
          classification?:
            | Database["public"]["Enums"]["supporter_classification"]
            | null
          client_id?: string
          cpf?: string | null
          created_at?: string | null
          endereco?: string | null
          engagement_score?: number | null
          first_contact_date?: string | null
          id?: string
          last_interaction_date?: string | null
          name?: string
          notes?: string | null
          referral_count?: number
          telefone?: string | null
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
      tea_fonte_cache: {
        Row: {
          codigo_ibge: number
          coletado_em: string | null
          fonte: string
          id: string
          payload: Json
        }
        Insert: {
          codigo_ibge: number
          coletado_em?: string | null
          fonte: string
          id?: string
          payload: Json
        }
        Update: {
          codigo_ibge?: number
          coletado_em?: string | null
          fonte?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      tea_legislacao_municipal: {
        Row: {
          ano: number | null
          codigo_ibge: number
          created_at: string | null
          ementa: string | null
          encontrado_via: string | null
          id: string
          municipio: string
          numero: string | null
          status: string | null
          tipo: string
          uf: string
          updated_at: string | null
          url_fonte: string | null
        }
        Insert: {
          ano?: number | null
          codigo_ibge: number
          created_at?: string | null
          ementa?: string | null
          encontrado_via?: string | null
          id?: string
          municipio: string
          numero?: string | null
          status?: string | null
          tipo: string
          uf: string
          updated_at?: string | null
          url_fonte?: string | null
        }
        Update: {
          ano?: number | null
          codigo_ibge?: number
          created_at?: string | null
          ementa?: string | null
          encontrado_via?: string | null
          id?: string
          municipio?: string
          numero?: string | null
          status?: string | null
          tipo?: string
          uf?: string
          updated_at?: string | null
          url_fonte?: string | null
        }
        Relationships: []
      }
      tea_municipios_ms: {
        Row: {
          atualizado_em: string
          bpc_def_0_17: number | null
          bpc_def_pct_estimado_tea: number | null
          bpc_def_qtd: number | null
          caps_ad_qtd: number | null
          caps_i_qtd: number | null
          caps_ii_qtd: number | null
          caps_iii_qtd: number | null
          caps_qtd: number | null
          capsi_qtd: number | null
          centro_referencia_tea: boolean | null
          cer_qtd: number | null
          codigo_ibge: number
          cras_qtd: number | null
          creas_qtd: number | null
          created_at: string
          escolas_com_aee: number | null
          est_tea_0_17_max: number | null
          est_tea_0_17_min: number | null
          est_tea_0_5_max: number | null
          est_tea_0_5_min: number | null
          est_tea_15_17_max: number | null
          est_tea_15_17_min: number | null
          est_tea_6_14_max: number | null
          est_tea_6_14_min: number | null
          est_tea_adultos_max: number | null
          est_tea_adultos_min: number | null
          est_tea_homens_max: number | null
          est_tea_homens_min: number | null
          est_tea_mulheres_max: number | null
          est_tea_mulheres_min: number | null
          est_tea_total_max: number | null
          est_tea_total_min: number | null
          fonoaudiologos_qtd: number | null
          fonte_json: Json | null
          gap_escolar_max: number | null
          gap_escolar_min: number | null
          gap_escolar_real_max: number | null
          gap_escolar_real_min: number | null
          hab_por_caps: number | null
          id: string
          legislacao_atualizado_em: string | null
          lei_ciptea: boolean | null
          lei_ciptea_numero: string | null
          lei_fila_zero: boolean | null
          matriculas_tea_ano: number | null
          matriculas_tea_creche: number | null
          matriculas_tea_estadual: number | null
          matriculas_tea_fundamental: number | null
          matriculas_tea_inep: number | null
          matriculas_tea_medio: number | null
          matriculas_tea_municipal: number | null
          matriculas_tea_privada: number | null
          nome: string
          observacoes: string | null
          pct_cobertura_escolar: number | null
          pediatras_qtd: number | null
          politica_capacitacao: boolean | null
          pop_0_5: number | null
          pop_15_17: number | null
          pop_18_mais: number | null
          pop_6_14: number | null
          populacao: number | null
          populacao_ano: number | null
          profs_aee: number | null
          psicologos_qtd: number | null
          tempo_diag_estimado_meses: number | null
          terapeutas_ocup_qtd: number | null
          ubs_qtd: number | null
          uf: string
        }
        Insert: {
          atualizado_em?: string
          bpc_def_0_17?: number | null
          bpc_def_pct_estimado_tea?: number | null
          bpc_def_qtd?: number | null
          caps_ad_qtd?: number | null
          caps_i_qtd?: number | null
          caps_ii_qtd?: number | null
          caps_iii_qtd?: number | null
          caps_qtd?: number | null
          capsi_qtd?: number | null
          centro_referencia_tea?: boolean | null
          cer_qtd?: number | null
          codigo_ibge: number
          cras_qtd?: number | null
          creas_qtd?: number | null
          created_at?: string
          escolas_com_aee?: number | null
          est_tea_0_17_max?: number | null
          est_tea_0_17_min?: number | null
          est_tea_0_5_max?: number | null
          est_tea_0_5_min?: number | null
          est_tea_15_17_max?: number | null
          est_tea_15_17_min?: number | null
          est_tea_6_14_max?: number | null
          est_tea_6_14_min?: number | null
          est_tea_adultos_max?: number | null
          est_tea_adultos_min?: number | null
          est_tea_homens_max?: number | null
          est_tea_homens_min?: number | null
          est_tea_mulheres_max?: number | null
          est_tea_mulheres_min?: number | null
          est_tea_total_max?: number | null
          est_tea_total_min?: number | null
          fonoaudiologos_qtd?: number | null
          fonte_json?: Json | null
          gap_escolar_max?: number | null
          gap_escolar_min?: number | null
          gap_escolar_real_max?: number | null
          gap_escolar_real_min?: number | null
          hab_por_caps?: number | null
          id?: string
          legislacao_atualizado_em?: string | null
          lei_ciptea?: boolean | null
          lei_ciptea_numero?: string | null
          lei_fila_zero?: boolean | null
          matriculas_tea_ano?: number | null
          matriculas_tea_creche?: number | null
          matriculas_tea_estadual?: number | null
          matriculas_tea_fundamental?: number | null
          matriculas_tea_inep?: number | null
          matriculas_tea_medio?: number | null
          matriculas_tea_municipal?: number | null
          matriculas_tea_privada?: number | null
          nome: string
          observacoes?: string | null
          pct_cobertura_escolar?: number | null
          pediatras_qtd?: number | null
          politica_capacitacao?: boolean | null
          pop_0_5?: number | null
          pop_15_17?: number | null
          pop_18_mais?: number | null
          pop_6_14?: number | null
          populacao?: number | null
          populacao_ano?: number | null
          profs_aee?: number | null
          psicologos_qtd?: number | null
          tempo_diag_estimado_meses?: number | null
          terapeutas_ocup_qtd?: number | null
          ubs_qtd?: number | null
          uf?: string
        }
        Update: {
          atualizado_em?: string
          bpc_def_0_17?: number | null
          bpc_def_pct_estimado_tea?: number | null
          bpc_def_qtd?: number | null
          caps_ad_qtd?: number | null
          caps_i_qtd?: number | null
          caps_ii_qtd?: number | null
          caps_iii_qtd?: number | null
          caps_qtd?: number | null
          capsi_qtd?: number | null
          centro_referencia_tea?: boolean | null
          cer_qtd?: number | null
          codigo_ibge?: number
          cras_qtd?: number | null
          creas_qtd?: number | null
          created_at?: string
          escolas_com_aee?: number | null
          est_tea_0_17_max?: number | null
          est_tea_0_17_min?: number | null
          est_tea_0_5_max?: number | null
          est_tea_0_5_min?: number | null
          est_tea_15_17_max?: number | null
          est_tea_15_17_min?: number | null
          est_tea_6_14_max?: number | null
          est_tea_6_14_min?: number | null
          est_tea_adultos_max?: number | null
          est_tea_adultos_min?: number | null
          est_tea_homens_max?: number | null
          est_tea_homens_min?: number | null
          est_tea_mulheres_max?: number | null
          est_tea_mulheres_min?: number | null
          est_tea_total_max?: number | null
          est_tea_total_min?: number | null
          fonoaudiologos_qtd?: number | null
          fonte_json?: Json | null
          gap_escolar_max?: number | null
          gap_escolar_min?: number | null
          gap_escolar_real_max?: number | null
          gap_escolar_real_min?: number | null
          hab_por_caps?: number | null
          id?: string
          legislacao_atualizado_em?: string | null
          lei_ciptea?: boolean | null
          lei_ciptea_numero?: string | null
          lei_fila_zero?: boolean | null
          matriculas_tea_ano?: number | null
          matriculas_tea_creche?: number | null
          matriculas_tea_estadual?: number | null
          matriculas_tea_fundamental?: number | null
          matriculas_tea_inep?: number | null
          matriculas_tea_medio?: number | null
          matriculas_tea_municipal?: number | null
          matriculas_tea_privada?: number | null
          nome?: string
          observacoes?: string | null
          pct_cobertura_escolar?: number | null
          pediatras_qtd?: number | null
          politica_capacitacao?: boolean | null
          pop_0_5?: number | null
          pop_15_17?: number | null
          pop_18_mais?: number | null
          pop_6_14?: number | null
          populacao?: number | null
          populacao_ano?: number | null
          profs_aee?: number | null
          psicologos_qtd?: number | null
          tempo_diag_estimado_meses?: number | null
          terapeutas_ocup_qtd?: number | null
          ubs_qtd?: number | null
          uf?: string
        }
        Relationships: []
      }
      tea_sync_log: {
        Row: {
          caps_coletados: number | null
          created_at: string
          duracao_ms: number | null
          erros: Json | null
          id: string
          municipios_processados: number | null
          status: string
          uf: string
        }
        Insert: {
          caps_coletados?: number | null
          created_at?: string
          duracao_ms?: number | null
          erros?: Json | null
          id?: string
          municipios_processados?: number | null
          status: string
          uf?: string
        }
        Update: {
          caps_coletados?: number | null
          created_at?: string
          duracao_ms?: number | null
          erros?: Json | null
          id?: string
          municipios_processados?: number | null
          status?: string
          uf?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          allowed_paths: string[]
          client_id: string
          created_at: string | null
          email: string
          id: string
          is_manager: boolean
          name: string
          permissions: Json | null
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allowed_paths?: string[]
          client_id: string
          created_at?: string | null
          email: string
          id?: string
          is_manager?: boolean
          name: string
          permissions?: Json | null
          role?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allowed_paths?: string[]
          client_id?: string
          created_at?: string | null
          email?: string
          id?: string
          is_manager?: boolean
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
      telemarketing_assignment_log: {
        Row: {
          acao: string
          campanha_id: string | null
          client_id: string
          contatos_count: number
          criado_em: string
          criado_por: string | null
          id: string
          operador_id: string | null
        }
        Insert: {
          acao: string
          campanha_id?: string | null
          client_id: string
          contatos_count?: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          operador_id?: string | null
        }
        Update: {
          acao?: string
          campanha_id?: string | null
          client_id?: string
          contatos_count?: number
          criado_em?: string
          criado_por?: string | null
          id?: string
          operador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemarketing_assignment_log_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemarketing_assignment_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemarketing_assignment_log_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_operadores"
            referencedColumns: ["id"]
          },
        ]
      }
      telemarketing_call_assignments: {
        Row: {
          client_id: string
          contato_id: string
          created_at: string
          expires_at: string
          id: string
          operador_nome: string
          tabela: string
        }
        Insert: {
          client_id: string
          contato_id: string
          created_at?: string
          expires_at: string
          id?: string
          operador_nome: string
          tabela: string
        }
        Update: {
          client_id?: string
          contato_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          operador_nome?: string
          tabela?: string
        }
        Relationships: []
      }
      telemarketing_call_log: {
        Row: {
          bairro: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          contato_id: string
          created_at: string
          id: string
          ligacao_status: string
          observacao: string | null
          operador_nome: string
          proxima_tentativa_em: string | null
          tabela: string
          vota_candidato: string | null
        }
        Insert: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id: string
          contato_id: string
          created_at?: string
          id?: string
          ligacao_status: string
          observacao?: string | null
          operador_nome: string
          proxima_tentativa_em?: string | null
          tabela: string
          vota_candidato?: string | null
        }
        Update: {
          bairro?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id?: string
          contato_id?: string
          created_at?: string
          id?: string
          ligacao_status?: string
          observacao?: string | null
          operador_nome?: string
          proxima_tentativa_em?: string | null
          tabela?: string
          vota_candidato?: string | null
        }
        Relationships: []
      }
      telemarketing_campanhas: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          descricao: string | null
          filtros: Json
          id: string
          nome: string
          script_intro: string | null
          script_perguntas: Json
          tags_rapidas: Json
          updated_at: string
          whatsapp_template: string | null
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          descricao?: string | null
          filtros?: Json
          id?: string
          nome: string
          script_intro?: string | null
          script_perguntas?: Json
          tags_rapidas?: Json
          updated_at?: string
          whatsapp_template?: string | null
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          descricao?: string | null
          filtros?: Json
          id?: string
          nome?: string
          script_intro?: string | null
          script_perguntas?: Json
          tags_rapidas?: Json
          updated_at?: string
          whatsapp_template?: string | null
        }
        Relationships: []
      }
      telemarketing_contatos_avulsos: {
        Row: {
          assigned_operador_id: string | null
          ativo: boolean
          bairro: string | null
          campanha_id: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          created_at: string
          id: string
          ligacao_em: string | null
          ligacao_status: string | null
          lista_id: string | null
          nome: string
          observacao_tele: string | null
          operador_nome: string | null
          proxima_tentativa_em: string | null
          telefone: string
          tentativas_count: number
          vota_candidato: string | null
        }
        Insert: {
          assigned_operador_id?: string | null
          ativo?: boolean
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id: string
          created_at?: string
          id?: string
          ligacao_em?: string | null
          ligacao_status?: string | null
          lista_id?: string | null
          nome: string
          observacao_tele?: string | null
          operador_nome?: string | null
          proxima_tentativa_em?: string | null
          telefone: string
          tentativas_count?: number
          vota_candidato?: string | null
        }
        Update: {
          assigned_operador_id?: string | null
          ativo?: boolean
          bairro?: string | null
          campanha_id?: string | null
          candidato_alternativo?: string | null
          cidade?: string | null
          client_id?: string
          created_at?: string
          id?: string
          ligacao_em?: string | null
          ligacao_status?: string | null
          lista_id?: string | null
          nome?: string
          observacao_tele?: string | null
          operador_nome?: string | null
          proxima_tentativa_em?: string | null
          telefone?: string
          tentativas_count?: number
          vota_candidato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemarketing_contatos_avulsos_assigned_operador_id_fkey"
            columns: ["assigned_operador_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemarketing_contatos_avulsos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemarketing_contatos_avulsos_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      telemarketing_import_duplicatas: {
        Row: {
          bairro: string | null
          cidade: string | null
          client_id: string
          criado_em: string | null
          id: string
          lista_id: string | null
          motivo: string | null
          nome: string | null
          telefone: string | null
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          client_id: string
          criado_em?: string | null
          id?: string
          lista_id?: string | null
          motivo?: string | null
          nome?: string | null
          telefone?: string | null
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          client_id?: string
          criado_em?: string | null
          id?: string
          lista_id?: string | null
          motivo?: string | null
          nome?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemarketing_import_duplicatas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemarketing_import_duplicatas_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      telemarketing_listas: {
        Row: {
          arquivado_em: string | null
          campanha_id: string
          client_id: string
          criado_em: string | null
          descricao: string | null
          id: string
          nome: string
          status: string | null
          total_contatos: number | null
        }
        Insert: {
          arquivado_em?: string | null
          campanha_id: string
          client_id: string
          criado_em?: string | null
          descricao?: string | null
          id?: string
          nome: string
          status?: string | null
          total_contatos?: number | null
        }
        Update: {
          arquivado_em?: string | null
          campanha_id?: string
          client_id?: string
          criado_em?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          status?: string | null
          total_contatos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemarketing_listas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemarketing_listas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      telemarketing_operador_audit: {
        Row: {
          client_id: string
          created_at: string
          detalhe: Json | null
          evento: string
          id: string
          operador_nome: string
        }
        Insert: {
          client_id: string
          created_at?: string
          detalhe?: Json | null
          evento: string
          id?: string
          operador_nome: string
        }
        Update: {
          client_id?: string
          created_at?: string
          detalhe?: Json | null
          evento?: string
          id?: string
          operador_nome?: string
        }
        Relationships: []
      }
      telemarketing_operadores: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          failed_attempts: number
          id: string
          last_login_at: string | null
          lista_atual_id: string | null
          locked_until: string | null
          nome: string
          password_updated_at: string
          senha: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          failed_attempts?: number
          id?: string
          last_login_at?: string | null
          lista_atual_id?: string | null
          locked_until?: string | null
          nome: string
          password_updated_at?: string
          senha: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          failed_attempts?: number
          id?: string
          last_login_at?: string | null
          lista_atual_id?: string | null
          locked_until?: string | null
          nome?: string
          password_updated_at?: string
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
          {
            foreignKeyName: "telemarketing_operadores_lista_atual_id_fkey"
            columns: ["lista_atual_id"]
            isOneToOne: false
            referencedRelation: "telemarketing_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      telemarketing_relatorio_snapshots: {
        Row: {
          atendeu: number
          campanha_id: string | null
          captured_at: string
          client_id: string
          created_by: string | null
          id: string
          indeciso: number
          ligados: number
          nao_atendeu: number
          payload: Json
          recusou: number
          rotulo: string
          total: number
          vota_nao: number
          vota_sim: number
        }
        Insert: {
          atendeu?: number
          campanha_id?: string | null
          captured_at?: string
          client_id: string
          created_by?: string | null
          id?: string
          indeciso?: number
          ligados?: number
          nao_atendeu?: number
          payload?: Json
          recusou?: number
          rotulo: string
          total?: number
          vota_nao?: number
          vota_sim?: number
        }
        Update: {
          atendeu?: number
          campanha_id?: string | null
          captured_at?: string
          client_id?: string
          created_by?: string | null
          id?: string
          indeciso?: number
          ligados?: number
          nao_atendeu?: number
          payload?: Json
          recusou?: number
          rotulo?: string
          total?: number
          vota_nao?: number
          vota_sim?: number
        }
        Relationships: []
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
      tse_votacao_local: {
        Row: {
          ano: number
          bairro: string | null
          cargo: string
          cod_municipio: number
          endereco: string | null
          id: number
          municipio: string
          nome_candidato: string | null
          nome_local: string | null
          nr_local: number
          numero: number
          turno: number
          uf: string
          votos: number
          zona: number
        }
        Insert: {
          ano: number
          bairro?: string | null
          cargo: string
          cod_municipio: number
          endereco?: string | null
          id?: number
          municipio: string
          nome_candidato?: string | null
          nome_local?: string | null
          nr_local: number
          numero: number
          turno: number
          uf: string
          votos?: number
          zona: number
        }
        Update: {
          ano?: number
          bairro?: string | null
          cargo?: string
          cod_municipio?: number
          endereco?: string | null
          id?: number
          municipio?: string
          nome_candidato?: string | null
          nome_local?: string | null
          nr_local?: number
          numero?: number
          turno?: number
          uf?: string
          votos?: number
          zona?: number
        }
        Relationships: []
      }
      tse_votacao_zona: {
        Row: {
          ano: number
          cargo: string
          cod_municipio: number
          id: number
          municipio: string
          nome_completo: string | null
          nome_urna: string | null
          numero: number | null
          partido: string | null
          situacao: string | null
          turno: number
          uf: string
          votos: number
          zona: number
        }
        Insert: {
          ano: number
          cargo: string
          cod_municipio: number
          id?: number
          municipio: string
          nome_completo?: string | null
          nome_urna?: string | null
          numero?: number | null
          partido?: string | null
          situacao?: string | null
          turno: number
          uf: string
          votos?: number
          zona: number
        }
        Update: {
          ano?: number
          cargo?: string
          cod_municipio?: number
          id?: number
          municipio?: string
          nome_completo?: string | null
          nome_urna?: string | null
          numero?: number | null
          partido?: string | null
          situacao?: string | null
          turno?: number
          uf?: string
          votos?: number
          zona?: number
        }
        Relationships: []
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
          cta_used: string | null
          dispatch_id: string
          enviado_em: string | null
          erro: string | null
          group_jid: string | null
          id: string
          instance_id: string | null
          mensagem_personalizada: string | null
          nome: string
          replied_at: string | null
          reply_text: string | null
          status: string
          telefone: string | null
          variant_used: string | null
        }
        Insert: {
          created_at?: string
          cta_used?: string | null
          dispatch_id: string
          enviado_em?: string | null
          erro?: string | null
          group_jid?: string | null
          id?: string
          instance_id?: string | null
          mensagem_personalizada?: string | null
          nome: string
          replied_at?: string | null
          reply_text?: string | null
          status?: string
          telefone?: string | null
          variant_used?: string | null
        }
        Update: {
          created_at?: string
          cta_used?: string | null
          dispatch_id?: string
          enviado_em?: string | null
          erro?: string | null
          group_jid?: string | null
          id?: string
          instance_id?: string | null
          mensagem_personalizada?: string | null
          nome?: string
          replied_at?: string | null
          reply_text?: string | null
          status?: string
          telefone?: string | null
          variant_used?: string | null
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
          cta_config: Json
          delay_max_seconds: number
          delay_min_seconds: number
          enviados: number
          error_message: string | null
          falhas: number
          humanization_config: Json
          id: string
          ignore_stage_cap: boolean
          max_instances: number | null
          media_type: string | null
          media_url: string | null
          mensagem_template: string
          pause_reason: string | null
          paused_until: string | null
          resume_count: number
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
          cta_config?: Json
          delay_max_seconds?: number
          delay_min_seconds?: number
          enviados?: number
          error_message?: string | null
          falhas?: number
          humanization_config?: Json
          id?: string
          ignore_stage_cap?: boolean
          max_instances?: number | null
          media_type?: string | null
          media_url?: string | null
          mensagem_template: string
          pause_reason?: string | null
          paused_until?: string | null
          resume_count?: number
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
          cta_config?: Json
          delay_max_seconds?: number
          delay_min_seconds?: number
          enviados?: number
          error_message?: string | null
          falhas?: number
          humanization_config?: Json
          id?: string
          ignore_stage_cap?: boolean
          max_instances?: number | null
          media_type?: string | null
          media_url?: string | null
          mensagem_template?: string
          pause_reason?: string | null
          paused_until?: string | null
          resume_count?: number
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
      whatsapp_group_favorites: {
        Row: {
          client_id: string
          favorited_at: string
          group_jid: string
          group_name: string | null
          phone_number: string
        }
        Insert: {
          client_id: string
          favorited_at?: string
          group_jid: string
          group_name?: string | null
          phone_number: string
        }
        Update: {
          client_id?: string
          favorited_at?: string
          group_jid?: string
          group_name?: string | null
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_favorites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_participants: {
        Row: {
          client_id: string
          first_seen_at: string
          group_jid: string
          id: string
          instance_id: string
          is_admin: boolean
          is_lid_only: boolean
          last_seen_at: string
          left_seen_at: string | null
          phone_e164: string | null
          raw_jid: string
        }
        Insert: {
          client_id: string
          first_seen_at?: string
          group_jid: string
          id?: string
          instance_id: string
          is_admin?: boolean
          is_lid_only?: boolean
          last_seen_at?: string
          left_seen_at?: string | null
          phone_e164?: string | null
          raw_jid: string
        }
        Update: {
          client_id?: string
          first_seen_at?: string
          group_jid?: string
          id?: string
          instance_id?: string
          is_admin?: boolean
          is_lid_only?: boolean
          last_seen_at?: string
          left_seen_at?: string | null
          phone_e164?: string | null
          raw_jid?: string
        }
        Relationships: []
      }
      whatsapp_groups: {
        Row: {
          client_id: string
          created_at: string
          group_jid: string
          id: string
          instance_id: string
          is_active: boolean | null
          is_admin: boolean | null
          is_announcement: boolean | null
          is_favorite: boolean
          last_synced_at: string
          name: string | null
          participants_count: number | null
          picture_url: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          group_jid: string
          id?: string
          instance_id: string
          is_active?: boolean | null
          is_admin?: boolean | null
          is_announcement?: boolean | null
          is_favorite?: boolean
          last_synced_at?: string
          name?: string | null
          participants_count?: number | null
          picture_url?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          group_jid?: string
          id?: string
          instance_id?: string
          is_active?: boolean | null
          is_admin?: boolean | null
          is_announcement?: boolean | null
          is_favorite?: boolean
          last_synced_at?: string
          name?: string | null
          participants_count?: number | null
          picture_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_dispatch_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_instance_health"
            referencedColumns: ["instance_id"]
          },
          {
            foreignKeyName: "whatsapp_groups_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
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
          preflight_reconnected: boolean
          preflight_status: string | null
          sent_at: string
          success: boolean
        }
        Insert: {
          client_id: string
          dispatch_id?: string | null
          error_message?: string | null
          id?: string
          instance_id: string
          preflight_reconnected?: boolean
          preflight_status?: string | null
          sent_at?: string
          success: boolean
        }
        Update: {
          client_id?: string
          dispatch_id?: string | null
          error_message?: string | null
          id?: string
          instance_id?: string
          preflight_reconnected?: boolean
          preflight_status?: string | null
          sent_at?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_send_log_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_dispatch_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instance_send_log_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "v_whatsapp_instance_health"
            referencedColumns: ["instance_id"]
          },
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
          auto_suspected_reason: string | null
          bridge_api_key: string | null
          bridge_instance_id: string | null
          bridge_url: string | null
          client_id: string
          connected_since: string | null
          consecutive_failures: number
          created_at: string
          created_by: string | null
          created_by_role: string | null
          daily_send_limit: number
          first_connected_at: string | null
          id: string
          instance_name: string | null
          instance_token: string | null
          is_active: boolean
          is_primary: boolean
          last_auto_reconnect_at: string | null
          last_create_instance_at: string | null
          last_disconnect_reason: string | null
          last_disconnected_at: string | null
          last_health_check_at: string | null
          last_keepalive_at: string | null
          last_keepalive_details: Json | null
          last_keepalive_status: string | null
          last_reconnect_attempt_at: string | null
          last_send_at: string | null
          last_webhook_rebound_at: string | null
          messages_sent_today: number
          messages_sent_today_date: string
          notes: string | null
          onboarding_pending_count: number | null
          onboarding_sent_at: string | null
          paused_until: string | null
          pending_onboarding: boolean
          phone_number: string | null
          qr_code: string | null
          ramp_up_stage: string
          reciprocity_rate: number
          reconnect_attempts_date: string | null
          reconnect_attempts_today: number
          stage_daily_cap: number | null
          status: string
          suspected_banned_at: string | null
          total_failed: number
          total_sent: number
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          auto_suspected_reason?: string | null
          bridge_api_key?: string | null
          bridge_instance_id?: string | null
          bridge_url?: string | null
          client_id: string
          connected_since?: string | null
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          daily_send_limit?: number
          first_connected_at?: string | null
          id?: string
          instance_name?: string | null
          instance_token?: string | null
          is_active?: boolean
          is_primary?: boolean
          last_auto_reconnect_at?: string | null
          last_create_instance_at?: string | null
          last_disconnect_reason?: string | null
          last_disconnected_at?: string | null
          last_health_check_at?: string | null
          last_keepalive_at?: string | null
          last_keepalive_details?: Json | null
          last_keepalive_status?: string | null
          last_reconnect_attempt_at?: string | null
          last_send_at?: string | null
          last_webhook_rebound_at?: string | null
          messages_sent_today?: number
          messages_sent_today_date?: string
          notes?: string | null
          onboarding_pending_count?: number | null
          onboarding_sent_at?: string | null
          paused_until?: string | null
          pending_onboarding?: boolean
          phone_number?: string | null
          qr_code?: string | null
          ramp_up_stage?: string
          reciprocity_rate?: number
          reconnect_attempts_date?: string | null
          reconnect_attempts_today?: number
          stage_daily_cap?: number | null
          status?: string
          suspected_banned_at?: string | null
          total_failed?: number
          total_sent?: number
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          auto_suspected_reason?: string | null
          bridge_api_key?: string | null
          bridge_instance_id?: string | null
          bridge_url?: string | null
          client_id?: string
          connected_since?: string | null
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          daily_send_limit?: number
          first_connected_at?: string | null
          id?: string
          instance_name?: string | null
          instance_token?: string | null
          is_active?: boolean
          is_primary?: boolean
          last_auto_reconnect_at?: string | null
          last_create_instance_at?: string | null
          last_disconnect_reason?: string | null
          last_disconnected_at?: string | null
          last_health_check_at?: string | null
          last_keepalive_at?: string | null
          last_keepalive_details?: Json | null
          last_keepalive_status?: string | null
          last_reconnect_attempt_at?: string | null
          last_send_at?: string | null
          last_webhook_rebound_at?: string | null
          messages_sent_today?: number
          messages_sent_today_date?: string
          notes?: string | null
          onboarding_pending_count?: number | null
          onboarding_sent_at?: string | null
          paused_until?: string | null
          pending_onboarding?: boolean
          phone_number?: string | null
          qr_code?: string | null
          ramp_up_stage?: string
          reciprocity_rate?: number
          reconnect_attempts_date?: string | null
          reconnect_attempts_today?: number
          stage_daily_cap?: number | null
          status?: string
          suspected_banned_at?: string | null
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
      whatsapp_send_retry_queue: {
        Row: {
          attempts: number
          client_id: string
          created_at: string
          enviado_em: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          mensagem: string
          next_attempt_at: string
          nome: string | null
          origem: string
          origem_ref: string | null
          status: string
          telefone: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          client_id: string
          created_at?: string
          enviado_em?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          mensagem: string
          next_attempt_at?: string
          nome?: string | null
          origem?: string
          origem_ref?: string | null
          status?: string
          telefone: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          client_id?: string
          created_at?: string
          enviado_em?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          mensagem?: string
          next_attempt_at?: string
          nome?: string | null
          origem?: string
          origem_ref?: string | null
          status?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_send_retry_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_eleicao_indicadores_cobranca: {
        Row: {
          cidade: string | null
          client_id: string | null
          cobrancas_enviadas: number | null
          fora_da_meta: boolean | null
          indicador_id: string | null
          meta: number | null
          nome: string | null
          parent_id: string | null
          regiao: string | null
          telefone: string | null
          tipo: Database["public"]["Enums"]["eleicao_tipo"] | null
          token: string | null
          token_id: string | null
          total_indicacoes: number | null
          ultima_cobranca_em: string | null
          ultimo_acesso_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eleicao_pessoas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "eleicao_pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eleicao_pessoas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_eleicao_indicadores_cobranca"
            referencedColumns: ["indicador_id"]
          },
        ]
      }
      v_whatsapp_dispatch_readiness: {
        Row: {
          apelido: string | null
          client_id: string | null
          connected_since: string | null
          consecutive_failures: number | null
          has_credentials: boolean | null
          id: string | null
          is_active: boolean | null
          is_primary: boolean | null
          last_disconnected_at: string | null
          last_health_check_at: string | null
          phone_number: string | null
          readiness: string | null
          status: string | null
          suspected_banned_at: string | null
        }
        Insert: {
          apelido?: string | null
          client_id?: string | null
          connected_since?: string | null
          consecutive_failures?: number | null
          has_credentials?: never
          id?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          last_disconnected_at?: string | null
          last_health_check_at?: string | null
          phone_number?: string | null
          readiness?: never
          status?: string | null
          suspected_banned_at?: string | null
        }
        Update: {
          apelido?: string | null
          client_id?: string | null
          connected_since?: string | null
          consecutive_failures?: number | null
          has_credentials?: never
          id?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          last_disconnected_at?: string | null
          last_health_check_at?: string | null
          phone_number?: string | null
          readiness?: never
          status?: string | null
          suspected_banned_at?: string | null
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
      v_whatsapp_instance_health: {
        Row: {
          apelido: string | null
          client_id: string | null
          daily_send_limit: number | null
          instance_id: string | null
          messages_sent_today: number | null
          ramp_up_stage: string | null
          reciprocity_pct_7d: number | null
          replied_7d: number | null
          sent_24h: number | null
          sent_7d: number | null
          stage_daily_cap: number | null
          status: string | null
          top_cta_7d: string | null
          unicity_pct_24h: number | null
          unique_variants_24h: number | null
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
    Functions: {
      _tele_assert_client_admin: {
        Args: { _client_id: string }
        Returns: undefined
      }
      _tele_assert_operador: {
        Args: { _client_id: string; _nome: string; _senha: string }
        Returns: string
      }
      _tele_like: { Args: { _v: string }; Returns: string }
      calculate_engagement_score: {
        Args: { p_days?: number; p_supporter_id: string }
        Returns: number
      }
      claim_invite_token: { Args: { _token: string }; Returns: string }
      client_missions_dashboard: {
        Args: { p_client_id: string }
        Returns: {
          archived_at: string
          click_avulso: number
          click_facebook: number
          click_instagram: number
          created_at: string
          declared_done: number
          last_event_at: string
          mission_id: string
          title: string
          total_opens: number
          tracking_enabled: boolean
          unique_participants: number
        }[]
      }
      compute_militant_badge: {
        Args: {
          p_30d_neg: number
          p_30d_pos: number
          p_first_seen: string
          p_last_seen: string
          p_total_comments: number
          p_total_neg: number
          p_total_pos: number
        }
        Returns: string
      }
      confirm_whatsapp_by_phone: {
        Args: { p_client_id: string; p_phone: string }
        Returns: Json
      }
      consume_lider_invite_token: { Args: { _token: string }; Returns: boolean }
      coordenador_pode_cadastrar: {
        Args: { _client_id: string; _coord_id: string; _tipo: string }
        Returns: boolean
      }
      count_pessoas_by_bairro: {
        Args: {
          p_bairro: string
          p_client_id: string
          p_only_whatsapp?: boolean
        }
        Returns: number
      }
      detect_llm_alerts: {
        Args: never
        Returns: {
          alert_id: string
          alert_type: string
          client_id: string
          severity: string
        }[]
      }
      eleicao_aplicar_dobradinha_raiz: {
        Args: {
          _parceiro_id: string
          _propagar?: boolean
          _raiz_id: string
          _rateio_estadual: number
          _rateio_parceiro: number
        }
        Returns: number
      }
      eleicao_definir_principal_regiao: {
        Args: { _client_id: string; _coordenador_id: string }
        Returns: undefined
      }
      eleicao_garantir_token_indicador: {
        Args: { _indicador_id: string }
        Returns: string
      }
      eleicao_gerar_token_indicador: {
        Args: { _indicador_id: string }
        Returns: string
      }
      eleicao_indicador_info: { Args: { _token: string }; Returns: Json }
      eleicao_indicar_lote: {
        Args: { _indicador_id: string; _linhas: Json }
        Returns: Json
      }
      eleicao_indicar_via_token: {
        Args: {
          _bairro?: string
          _cidade?: string
          _nome: string
          _observacao?: string
          _telefone: string
          _token: string
        }
        Returns: Json
      }
      eleicao_listar_cidades_interior_sem_principal: {
        Args: { _client_id: string }
        Returns: {
          candidatos: Json
          cidade: string
        }[]
      }
      eleicao_listar_contatos_pacote: {
        Args: {
          _apenas_novos?: boolean
          _client_id: string
          _coordenador_id: string
        }
        Returns: {
          bairro: string
          ja_enviado: boolean
          nome: string
          pessoa_id: string
          telefone: string
          tipo: string
        }[]
      }
      eleicao_listar_indicacoes_token: {
        Args: { _limit?: number; _token: string }
        Returns: {
          bairro: string
          created_at: string
          id: string
          nome: string
          telefone: string
        }[]
      }
      eleicao_listar_indicadores_team: {
        Args: { _coordenador_id: string }
        Returns: {
          cidade: string
          client_id: string
          cobrancas_enviadas: number
          indicador_id: string
          meta: number
          nome: string
          parent_id: string
          regiao: string
          telefone: string
          tipo: string
          token: string
          total_indicacoes: number
          ultima_cobranca_em: string
          ultimo_acesso_em: string
        }[]
      }
      eleicao_listar_indicados_token: {
        Args: { _token: string }
        Returns: {
          bairro: string
          created_at: string
          id: string
          nome: string
          telefone: string
        }[]
      }
      eleicao_listar_regioes_distribuicao: {
        Args: { _client_id: string }
        Returns: {
          coordenador_id: string
          coordenador_nome: string
          coordenador_telefone: string
          escopo: string
          regiao_key: string
          regiao_label: string
          total_elegivel: number
          total_ja_enviado: number
          total_novos: number
          ultima_distribuicao_em: string
          ultimo_canal: string
        }[]
      }
      eleicao_pessoa_in_user_tree:
        | { Args: { _pessoa_id: string }; Returns: boolean }
        | { Args: { _pessoa_id: string; _user_id: string }; Returns: boolean }
      eleicao_remover_indicacao_token: {
        Args: { _indicado_id: string; _token: string }
        Returns: Json
      }
      engagement_alterar_cargo: {
        Args: {
          p_cidade?: string
          p_novo_cargo: string
          p_orfaos?: string
          p_origem: string
          p_ref: string
          p_regiao?: string
          p_telefone?: string
        }
        Returns: Json
      }
      engagement_buscar_time: {
        Args: { p_client_id: string; p_limit?: number; p_termo: string }
        Returns: {
          cargo: string
          cidade: string
          facebook_key: string
          instagram_handle: string
          nome: string
          origem: string
          ref_id: string
          regiao: string
          supporter_id: string
          telefone: string
        }[]
      }
      engagement_cobranca_overview: {
        Args: { p_client_id: string; p_days?: number }
        Returns: {
          cargo: string
          cidade: string
          dias_sem_interagir: number
          facebook_comments: number
          facebook_key: string
          instagram_comments: number
          instagram_handle: string
          interacoes: number
          last_interaction: string
          min_interacoes: number
          min_missoes: number
          missoes_abertas: number
          missoes_concluidas: number
          missoes_disponiveis: number
          nome: string
          origem: string
          ref_id: string
          regiao: string
          situacao: string
          telefone: string
        }[]
      }
      engagement_ensure_entity_supporter: {
        Args: { p_origem: string; p_ref: string }
        Returns: string
      }
      engagement_ensure_pessoa_supporter: {
        Args: { p_pessoa_id: string }
        Returns: string
      }
      engagement_entity_link_author: {
        Args: {
          p_author_name?: string
          p_origem: string
          p_picture?: string
          p_platform: string
          p_platform_user_id: string
          p_ref: string
        }
        Returns: Json
      }
      engagement_entity_remove_social: {
        Args: { p_origem: string; p_plataforma: string; p_ref: string }
        Returns: boolean
      }
      engagement_entity_upsert_social: {
        Args: {
          p_origem: string
          p_plataforma: string
          p_ref: string
          p_url?: string
          p_usuario: string
        }
        Returns: Json
      }
      engagement_link_author: {
        Args: {
          p_author_name?: string
          p_pessoa_id: string
          p_picture?: string
          p_platform: string
          p_platform_user_id: string
        }
        Returns: Json
      }
      engagement_perfis_overview: {
        Args: { p_client_id: string; p_days?: number }
        Returns: {
          facebook_comments: number
          facebook_key: string
          facebook_label: string
          instagram_comments: number
          instagram_handle: string
          last_interaction: string
          nome: string
          other_actions: number
          pessoa_id: string
          supporter_id: string
          telefone: string
          tipo_pessoa: string
        }[]
      }
      engagement_remove_social: {
        Args: { p_pessoa_id: string; p_plataforma: string }
        Returns: boolean
      }
      engagement_time_overview: {
        Args: { p_client_id: string; p_days?: number }
        Returns: {
          cargo: string
          cidade: string
          facebook_comments: number
          facebook_key: string
          facebook_label: string
          instagram_comments: number
          instagram_handle: string
          last_interaction: string
          missoes_abertas: number
          missoes_concluidas: number
          nome: string
          origem: string
          other_actions: number
          ref_id: string
          regiao: string
          supporter_id: string
          telefone: string
        }[]
      }
      engagement_unlinked_authors: {
        Args: { p_client_id: string; p_limit?: number; p_platform?: string }
        Returns: {
          author_name: string
          author_profile_picture: string
          last_seen: string
          platform_user_id: string
          total_comments: number
        }[]
      }
      engagement_upsert_social: {
        Args: {
          p_pessoa_id: string
          p_plataforma: string
          p_url?: string
          p_usuario: string
        }
        Returns: Json
      }
      enqueue_whatsapp_retry: {
        Args: {
          p_client_id: string
          p_mensagem: string
          p_nome?: string
          p_origem?: string
          p_origem_ref?: string
          p_telefone: string
        }
        Returns: string
      }
      ensure_supporter_for_entity: {
        Args: { p_client_id: string; p_nome: string; p_redes: Json }
        Returns: string
      }
      get_active_campaign_frames: {
        Args: { _client_id: string }
        Returns: {
          composition: Json
          display_order: number
          id: string
          image_url: string
          nome: string
        }[]
      }
      get_candidate_breakdown: {
        Args: {
          p_anos?: number[]
          p_cargo?: string
          p_nome: string
          p_partido?: string
          p_uf?: string
        }
        Returns: {
          ano: number
          cargo: string
          municipio: string
          nome_urna: string
          partido: string
          uf: string
          votos: number
        }[]
      }
      get_chapa_candidates: {
        Args: {
          p_anos?: number[]
          p_cargos?: string[]
          p_min_votos?: number
          p_municipio?: string
          p_partido?: string
          p_search?: string
          p_uf?: string
        }
        Returns: {
          cargos: string
          municipios: string
          nome_completo: string
          nome_urna: string
          partido: string
          total: number
          ufs: string
          votos_2022: number
          votos_2024: number
        }[]
      }
      get_client_public: {
        Args: { _client_id: string }
        Returns: {
          id: string
          logo_url: string
          name: string
          whatsapp_oficial: string
          whatsapp_window_enabled: boolean
          whatsapp_window_end: string
          whatsapp_window_start: string
        }[]
      }
      get_cobertura_territorial: {
        Args: { p_client_id: string }
        Returns: {
          bairro: string
          dias_silencio: number
          n_falas: number
          n_promessas_abertas: number
          nivel_alerta: string
          tom_predominante: string
          ultima_mencao: string
        }[]
      }
      get_eleicao_cadastro_flags: {
        Args: { _client_id: string }
        Returns: {
          cadastro_cabo_ativo: boolean
          cadastro_lider_ativo: boolean
        }[]
      }
      get_eleicao_pessoas_for_client: {
        Args: { _client_id: string }
        Returns: {
          assigned_operador_id: string | null
          bairro: string | null
          campanha_id: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          confirmado_em: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string
          escopo: Database["public"]["Enums"]["eleicao_escopo"]
          funcionario_id: string | null
          geocode_endereco_hash: string | null
          geocode_precision: string | null
          geocode_status: string | null
          geocoded_at: string | null
          id: string
          is_favorito_regiao: boolean
          is_voluntario: boolean
          lat: number | null
          ligacao_em: string | null
          ligacao_status: string | null
          lng: number | null
          nome: string
          numero: string | null
          observacao_tele: string | null
          observacoes: string | null
          operador_nome: string | null
          parceiro_id: string | null
          parent_id: string | null
          participou_reuniao: boolean | null
          pode_cadastrar_cabo: boolean
          pode_cadastrar_lider: boolean
          pre_selecionado: boolean | null
          proxima_tentativa_em: string | null
          rateio_estadual: number
          rateio_parceiro: number
          regiao: string | null
          reuniao_em: string | null
          rua: string | null
          status_contratacao: string | null
          supporter_id: string | null
          telefone: string
          tentativas_count: number
          tipo: Database["public"]["Enums"]["eleicao_tipo"]
          updated_at: string
          user_id: string | null
          valor_contratacao: number
          voluntario_marcado_em: string | null
          voluntario_obs: string | null
          vota_candidato: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "eleicao_pessoas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_eleicao_portal_config: {
        Args: { _client_id: string }
        Returns: {
          cadastro_cabo_ativo: boolean
          cadastro_lider_ativo: boolean
          cadastro_voluntario_ativo: boolean
          grupos_links: Json
        }[]
      }
      get_migracoes_partidarias: {
        Args: { p_min_votos?: number; p_uf?: string }
        Returns: {
          cargo_2022: string
          cargo_2024: string
          nome_completo: string
          partido_2022: string
          partido_2024: string
          votos_2022: number
          votos_2024: number
        }[]
      }
      get_partido_evolucao: {
        Args: { p_cargo?: string; p_uf?: string }
        Returns: {
          candidatos_2022: number
          candidatos_2024: number
          municipios_2022: number
          municipios_2024: number
          partido: string
          variacao_pct: number
          variacao_votos: number
          votos_2022: number
          votos_2024: number
        }[]
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
      get_public_client_by_slug: {
        Args: { _slug: string }
        Returns: {
          id: string
          logo_url: string
          name: string
        }[]
      }
      get_tse_locais_summary: {
        Args: { p_cargo: string; p_turno: number }
        Returns: {
          bairro: string
          endereco: string
          nome_local: string
          nr_local: number
          total_votos: number
          zona: number
        }[]
      }
      get_tse_municipios: {
        Args: never
        Returns: {
          municipio: string
          uf: string
        }[]
      }
      get_tse_partidos: {
        Args: never
        Returns: {
          partido: string
        }[]
      }
      get_votos_por_municipio: {
        Args: {
          p_anos?: number[]
          p_cargo?: string
          p_partido?: string
          p_uf?: string
        }
        Returns: {
          candidatos: number
          municipio: string
          partidos: number
          total: number
          uf: string
          votos_2022: number
          votos_2024: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_telemarketing_senha: { Args: { p_senha: string }; Returns: string }
      ic_trigger_monthly_drift: { Args: never; Returns: undefined }
      increment_material_download: {
        Args: { _material_id: string }
        Returns: undefined
      }
      is_client_manager: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      is_client_member: { Args: { _client_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_valid_cpf: { Args: { cpf: string }; Returns: boolean }
      link_orphan_engagement_actions: {
        Args: { p_client_id: string }
        Returns: number
      }
      llm_ops_chain: {
        Args: { p_correlation_id: string }
        Returns: {
          client_id: string
          completion_tokens: number | null
          correlation_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          error_type: string | null
          estimated_cost_usd: number | null
          function_name: string
          id: string
          latency_ms: number | null
          model: string
          parent_function: string | null
          prompt_tokens: number | null
          provider: string
          request_id: string
          retries: number
          success: boolean
          tier: string
          total_tokens: number | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "llm_usage_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      llm_ops_cost_by_tenant: {
        Args: { p_minutes?: number }
        Returns: {
          calls: number
          client_id: string
          estimated_cost_usd: number
          total_tokens: number
        }[]
      }
      llm_ops_error_heatmap: {
        Args: { p_minutes?: number }
        Returns: {
          bucket: string
          error_type: string
          errors: number
          function_name: string
        }[]
      }
      llm_ops_latency_percentiles: {
        Args: { p_minutes?: number }
        Returns: {
          calls: number
          model: string
          p50_ms: number
          p95_ms: number
          p99_ms: number
          provider: string
        }[]
      }
      llm_ops_retry_heatmap: {
        Args: { p_minutes?: number }
        Returns: {
          bucket: string
          calls: number
          provider: string
          retries: number
        }[]
      }
      llm_ops_top_functions: {
        Args: { p_limit?: number; p_minutes?: number }
        Returns: {
          avg_latency_ms: number
          calls: number
          error_rate: number
          function_name: string
          total_tokens: number
        }[]
      }
      log_whatsapp_send: {
        Args: {
          p_client_id: string
          p_dispatch_id: string
          p_error_message?: string
          p_instance_id: string
          p_preflight_reconnected?: boolean
          p_preflight_status?: string
          p_success: boolean
        }
        Returns: undefined
      }
      match_ic_documents: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_client_id: string
          query_embedding: string
        }
        Returns: {
          created_at: string
          data_evento: string
          id: string
          local: string
          resumo_executivo: string
          similarity: number
          tags: string[]
          tipo_documento: string
          titulo: string
        }[]
      }
      mission_generate_short_code: { Args: never; Returns: string }
      municipio_ranking: {
        Args: { p_codigo_ibge: number }
        Returns: {
          ano: number
          area: string
          delta_pct: number
          fonte: string
          higher_is_worse: boolean
          indicador_id: string
          indicador_label: string
          max_uf: number
          media_uf: number
          min_uf: number
          percentil: number
          posicao: number
          total_uf: number
          unidade: string
          valor: number
        }[]
      }
      municipios_ranking_uf: {
        Args: { p_uf: string }
        Returns: {
          ano: number
          area: string
          codigo_ibge: number
          delta_pct: number
          delta_vs_media: number
          fonte: string
          higher_is_worse: boolean
          indicador_id: string
          indicador_label: string
          max_uf: number
          media_uf: number
          mediana_uf: number
          min_uf: number
          nome: string
          percentil: number
          posicao: number
          total_uf: number
          unidade: string
          valor: number
        }[]
      }
      normalize_br_phone: { Args: { p_raw: string }; Returns: string }
      normalize_locality: { Args: { p_input: string }; Returns: string }
      normalize_person_name: { Args: { p_name: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      only_digits: { Args: { input: string }; Returns: string }
      pick_healthy_instance_for_group:
        | {
            Args: { p_client_id: string; p_group_jid: string }
            Returns: string
          }
        | {
            Args: {
              p_client_id: string
              p_exclude_instance_ids?: string[]
              p_group_jid: string
            }
            Returns: string
          }
      pick_healthy_whatsapp_instance: {
        Args: { p_client_id: string }
        Returns: string
      }
      promote_whatsapp_ramp_stages: { Args: never; Returns: number }
      public_mission_config: {
        Args: { p_code: string; p_mission_id: string; p_token: string }
        Returns: Json
      }
      public_mission_event: {
        Args: {
          p_code: string
          p_device: string
          p_is_bot: boolean
          p_mission_id: string
          p_token: string
          p_type: string
          p_user_agent: string
        }
        Returns: Json
      }
      public_mission_identify: {
        Args: {
          p_code: string
          p_device: string
          p_is_bot: boolean
          p_mission_id: string
          p_nome: string
          p_phone: string
          p_user_agent: string
        }
        Returns: Json
      }
      public_mission_switch: { Args: { p_token: string }; Returns: Json }
      purge_llm_usage_log: { Args: { p_days?: number }; Returns: number }
      recompute_militant: {
        Args: {
          p_client_id: string
          p_platform: string
          p_platform_user_id: string
        }
        Returns: undefined
      }
      register_pessoa_public: {
        Args: {
          p_bairro?: string
          p_cidade?: string
          p_client_id: string
          p_cpf?: string
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
      resume_stuck_whatsapp_dispatches: { Args: never; Returns: undefined }
      reuniao_client_can_access: {
        Args: { _client_id: string }
        Returns: boolean
      }
      reuniao_info_token: { Args: { _token: string }; Returns: Json }
      reuniao_inscrever_token: {
        Args: {
          _nome: string
          _sessao_id: string
          _telefone: string
          _token: string
        }
        Returns: Json
      }
      reuniao_minha_inscricao_token: {
        Args: { _telefone: string; _token: string }
        Returns: Json
      }
      reuniao_user_can_access: {
        Args: { _reuniao_id: string }
        Returns: boolean
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
      tea_ranking_ms: { Args: { p_codigo_ibge: number }; Returns: Json }
      tele_admin_listar_avulsos: {
        Args: { _campanha_id: string; _client_id: string }
        Returns: {
          assigned_operador_id: string
          assigned_operador_nome: string
          bairro: string
          cidade: string
          id: string
          ligacao_em: string
          ligacao_status: string
          nome: string
          operador_nome: string
          telefone: string
          tentativas_count: number
        }[]
      }
      tele_admin_listar_contatos_full: {
        Args: { _client_id: string }
        Returns: {
          bairro: string
          campanha_id: string
          campanha_nome: string
          candidato_alternativo: string
          cidade: string
          contratado_id: string
          id: string
          is_lider: boolean
          lider_id: string
          ligacao_em: string
          ligacao_status: string
          nome: string
          operador_nome: string
          tabela: string
          telefone: string
          tipo: string
          vota_candidato: string
        }[]
      }
      tele_admin_resumo_listas: {
        Args: { _campanha_id?: string; _client_id: string }
        Returns: {
          campanha_id: string
          campanha_nome: string
          criado_em: string
          id: string
          ligados: number
          nome: string
          pendentes: number
          total: number
        }[]
      }
      tele_assign_contatos: {
        Args: {
          _campanha_id: string
          _client_id: string
          _contato_ids: string[]
          _operador_id: string
        }
        Returns: Json
      }
      tele_buscar_contato: {
        Args: {
          _campanha_id?: string
          _client_id: string
          _limite?: number
          _nome: string
          _senha: string
          _termo: string
        }
        Returns: {
          bairro: string
          campanha_id: string
          candidato_alternativo: string
          cidade: string
          id: string
          indicador_nome: string
          indicador_tipo: string
          ligacao_em: string
          ligacao_status: string
          lista_id: string
          locked_by: string
          locked_until: string
          nome: string
          observacao_tele: string
          operador_nome: string
          proxima_tentativa_em: string
          tabela: string
          telefone: string
          tentativas_count: number
          tipo: string
          vota_candidato: string
        }[]
      }
      tele_capture_snapshot: {
        Args: { _campanha_id?: string; _client_id: string; _rotulo: string }
        Returns: string
      }
      tele_change_operador_password: {
        Args: { _new_senha: string; _operador_id: string }
        Returns: Json
      }
      tele_claim_contato: {
        Args: {
          _client_id: string
          _id: string
          _nome: string
          _senha: string
          _tabela: string
          _ttl_seconds?: number
        }
        Returns: Json
      }
      tele_create_fila_wizard: {
        Args: {
          _client_id: string
          _csv_rows?: Json
          _descricao: string
          _filtros?: Json
          _nome: string
          _origem: string
          _script_intro: string
          _script_perguntas: string[]
          _tags_rapidas: string[]
        }
        Returns: Json
      }
      tele_designar_eleicao_indicados: {
        Args: {
          _campanha_id: string
          _client_id: string
          _filtros: Json
          _substituir?: boolean
        }
        Returns: Json
      }
      tele_designar_lista_operador: {
        Args: { _client_id: string; _lista_id: string; _operador_id: string }
        Returns: Json
      }
      tele_distribute_contatos: {
        Args: {
          _campanha_id: string
          _client_id: string
          _contato_ids: string[]
          _operador_ids: string[]
        }
        Returns: Json
      }
      tele_ensure_test_operador: { Args: { _client_id: string }; Returns: Json }
      tele_fila_summary: {
        Args: { _client_id: string }
        Returns: {
          ativo: boolean
          campanha_id: string
          confirmados: number
          created_at: string
          descricao: string
          ligados: number
          nome: string
          pendentes: number
          total: number
        }[]
      }
      tele_get_contato_log: {
        Args: { _client_id: string; _contato_id: string; _tabela: string }
        Returns: {
          bairro: string | null
          candidato_alternativo: string | null
          cidade: string | null
          client_id: string
          contato_id: string
          created_at: string
          id: string
          ligacao_status: string
          observacao: string | null
          operador_nome: string
          proxima_tentativa_em: string | null
          tabela: string
          vota_candidato: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "telemarketing_call_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tele_heartbeat_contato: {
        Args: {
          _client_id: string
          _id: string
          _nome: string
          _senha: string
          _tabela: string
          _ttl_seconds?: number
        }
        Returns: Json
      }
      tele_import_contato_avulso_batch: {
        Args: {
          _assigned_operador_id?: string
          _campanha_id: string
          _client_id: string
          _lista_nome?: string
          _rows: Json
          _skip_global_dupes?: boolean
        }
        Returns: Json
      }
      tele_indicador_drill: {
        Args: {
          _campanha_id?: string
          _client_id: string
          _indicador_id: string
        }
        Returns: {
          bairro: string
          cidade: string
          id: string
          nome: string
          status_telemarketing: string
          telefone: string
          total_tentativas: number
          ultima_ligacao_em: string
          ultimo_status_ligacao: string
          vota_candidato: string
        }[]
      }
      tele_indicador_report_rows: {
        Args: { _client_id: string }
        Returns: {
          bairro: string
          campanha_id: string
          campanha_nome: string
          candidato_alternativo: string
          cidade: string
          contato_id: string
          indicador_id: string
          indicador_nome: string
          indicador_regiao: string
          indicador_tipo: string
          nome: string
          operador_nome: string
          proxima_tentativa_em: string
          status_telemarketing: string
          telefone: string
          total_tentativas: number
          ultima_ligacao_em: string
          ultimo_status_ligacao: string
          vota_candidato: string
        }[]
      }
      tele_indicador_scorecard: {
        Args: {
          _campanha_id?: string
          _client_id: string
          _indicador_tipo?: string
        }
        Returns: {
          confirmados: number
          indecisos: number
          indicador_id: string
          indicador_nome: string
          indicador_tipo: string
          invalidos: number
          ligados: number
          nao_atendeu: number
          recusou: number
          rejeitados: number
          score_qualidade: number
          taxa_confirmacao: number
          taxa_voto_efetivo: number
          total_indicados: number
        }[]
      }
      tele_limpar_eleicao_campanha: {
        Args: { _campanha_id: string; _client_id: string }
        Returns: Json
      }
      tele_list_campanhas_scripts: {
        Args: { _client_id: string; _nome: string; _senha: string }
        Returns: {
          id: string
          nome: string
          script_intro: string
          script_perguntas: Json
          tags_rapidas: Json
          whatsapp_template: string
        }[]
      }
      tele_list_contatos: {
        Args: {
          _campanha_id?: string
          _client_id: string
          _nome: string
          _senha: string
        }
        Returns: {
          bairro: string
          campanha_id: string
          candidato_alternativo: string
          cidade: string
          id: string
          indicador_nome: string
          indicador_tipo: string
          ligacao_em: string
          ligacao_status: string
          lista_id: string
          locked_by: string
          locked_until: string
          nome: string
          observacao_tele: string
          operador_nome: string
          proxima_tentativa_em: string
          tabela: string
          telefone: string
          tentativas_count: number
          tipo: string
          vota_candidato: string
        }[]
      }
      tele_list_indicadores: {
        Args: { _client_id: string }
        Returns: {
          cidade: string
          id: string
          nome: string
          tipo: string
        }[]
      }
      tele_operador_campanhas: {
        Args: { _client_id: string; _nome: string; _senha: string }
        Returns: {
          campanha_id: string
          descricao: string
          nome: string
          pendentes_livres: number
          pendentes_meus: number
          total_meus: number
        }[]
      }
      tele_operador_counts_por_campanha: {
        Args: { _campanha_id: string; _client_id: string }
        Returns: {
          ligados: number
          operador_id: string
          operador_nome: string
          pendentes: number
        }[]
      }
      tele_operadores_ao_vivo: {
        Args: { _client_id: string }
        Returns: {
          contato_id: string
          contato_nome: string
          contato_telefone: string
          expires_at: string
          lista_nome: string
          operador_nome: string
          started_at: string
          tabela: string
        }[]
      }
      tele_popular_fila: {
        Args: {
          _campanha_id: string
          _client_id: string
          _csv_rows?: Json
          _filtros?: Json
          _origem: string
        }
        Returns: Json
      }
      tele_preview_eleicao_indicados: {
        Args: { _client_id: string; _filtros: Json }
        Returns: Json
      }
      tele_preview_fila: {
        Args: {
          _client_id: string
          _csv_count?: number
          _filtros?: Json
          _origem: string
        }
        Returns: Json
      }
      tele_proximo_contato: {
        Args: {
          _campanha_id?: string
          _client_id: string
          _nome: string
          _senha: string
          _ttl_seconds?: number
        }
        Returns: Json
      }
      tele_ranking_indicadores: {
        Args: {
          _campanha_id?: string
          _client_id: string
          _data_ate?: string
          _data_de?: string
          _universo?: string
        }
        Returns: {
          bairro: string
          cidade: string
          confirmados: number
          coordenador_id: string
          coordenador_nome: string
          filhos_count: number
          indecisos: number
          indicados_diretos: number
          indicados_total: number
          ligados: number
          meta: number
          pendentes: number
          pessoa_id: string
          pessoa_nome: string
          pessoa_tipo: string
          rejeitados: number
          taxa_conversao: number
          ultima_atividade: string
        }[]
      }
      tele_ranking_indicados_da_pessoa: {
        Args: {
          _campanha_id?: string
          _client_id: string
          _data_ate?: string
          _data_de?: string
          _incluir_filhos?: boolean
          _pessoa_id: string
          _universo?: string
        }
        Returns: {
          bairro: string
          candidato_alternativo: string
          cidade: string
          created_at: string
          indicado_id: string
          indicador_id: string
          indicador_nome: string
          nome: string
          observacao_tele: string
          operador_nome: string
          telefone: string
          total_tentativas: number
          ultima_ligacao_em: string
          ultimo_status_ligacao: string
          vota_candidato: string
        }[]
      }
      tele_reassign_from_operador: {
        Args: {
          _client_id: string
          _operador_id: string
          _to_operador_ids?: string[]
        }
        Returns: Json
      }
      tele_redistribute_campanha: {
        Args: {
          _campanha_id: string
          _client_id: string
          _only_pending?: boolean
          _operador_ids: string[]
        }
        Returns: Json
      }
      tele_registrar_ligacao: {
        Args: {
          _bairro: string
          _candidato_alternativo?: string
          _cidade: string
          _client_id: string
          _id: string
          _ligacao_status: string
          _nome: string
          _observacao?: string
          _proxima_tentativa_em?: string
          _senha: string
          _tabela: string
          _vota_candidato?: string
        }
        Returns: Json
      }
      tele_release_contato: {
        Args: {
          _client_id: string
          _id: string
          _nome: string
          _senha: string
          _tabela: string
        }
        Returns: Json
      }
      tele_release_contatos: {
        Args: {
          _campanha_id: string
          _client_id: string
          _contato_ids: string[]
        }
        Returns: Json
      }
      tele_remover_da_fila: {
        Args: {
          _campanha_id: string
          _client_id: string
          _ids: string[]
          _tabela: string
        }
        Returns: Json
      }
      tele_unlock_operador: { Args: { _operador_id: string }; Returns: Json }
      unaccent: { Args: { "": string }; Returns: string }
      user_allowed_paths: { Args: { _client_id: string }; Returns: string[] }
      user_can_access_client: { Args: { _client_id: string }; Returns: boolean }
      user_has_client_access: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      validate_lider_invite_token: {
        Args: { _token: string }
        Returns: {
          client_id: string
          expires_at: string
          note: string
          reason: string
          used_at: string
          valid: boolean
        }[]
      }
      validate_referral_code: {
        Args: { _client_id: string; _code: string }
        Returns: {
          referrer_name: string
          valid: boolean
        }[]
      }
      verify_telemarketing_operador: {
        Args: { _client_id: string; _nome: string; _senha: string }
        Returns: {
          id: string
          nome: string
        }[]
      }
      watchdog_resume_stuck_dispatches: { Args: never; Returns: number }
      whatsapp_effective_daily_limit: {
        Args: { p_daily_limit: number; p_stage: string }
        Returns: number
      }
      whatsapp_phone_variants: { Args: { p_phone: string }; Returns: string[] }
    }
    Enums: {
      app_role:
        | "admin"
        | "client"
        | "funcionario"
        | "platform_user"
        | "portal_pessoa"
      comment_status: "pending" | "responded" | "ignored"
      eleicao_escopo: "campo_grande" | "interior"
      eleicao_tipo: "coordenador" | "lider" | "cabo"
      llm_provider:
        | "groq"
        | "openai"
        | "anthropic"
        | "gemini"
        | "mistral"
        | "cohere"
      mission_event_type:
        | "open"
        | "click_facebook"
        | "click_instagram"
        | "click_avulso"
        | "declared_done"
      nivel_apoio:
        | "desconhecido"
        | "simpatizante"
        | "apoiador"
        | "militante"
        | "opositor"
      nivel_parlamentar:
        | "federal_deputado"
        | "federal_senador"
        | "estadual_deputado"
        | "municipal_vereador"
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
      app_role: [
        "admin",
        "client",
        "funcionario",
        "platform_user",
        "portal_pessoa",
      ],
      comment_status: ["pending", "responded", "ignored"],
      eleicao_escopo: ["campo_grande", "interior"],
      eleicao_tipo: ["coordenador", "lider", "cabo"],
      llm_provider: [
        "groq",
        "openai",
        "anthropic",
        "gemini",
        "mistral",
        "cohere",
      ],
      mission_event_type: [
        "open",
        "click_facebook",
        "click_instagram",
        "click_avulso",
        "declared_done",
      ],
      nivel_apoio: [
        "desconhecido",
        "simpatizante",
        "apoiador",
        "militante",
        "opositor",
      ],
      nivel_parlamentar: [
        "federal_deputado",
        "federal_senador",
        "estadual_deputado",
        "municipal_vereador",
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
