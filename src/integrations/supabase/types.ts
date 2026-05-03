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
      clients: {
        Row: {
          cargo: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cargo?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string | null
          user_id?: string
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
      integrations: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          llm_api_key: string | null
          llm_model: string | null
          llm_provider: Database["public"]["Enums"]["llm_provider"] | null
          meta_access_token: string | null
          meta_instagram_id: string | null
          meta_page_id: string | null
          meta_webhook_url: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          llm_api_key?: string | null
          llm_model?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"] | null
          meta_access_token?: string | null
          meta_instagram_id?: string | null
          meta_page_id?: string | null
          meta_webhook_url?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          llm_api_key?: string | null
          llm_model?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"] | null
          meta_access_token?: string | null
          meta_instagram_id?: string | null
          meta_page_id?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_engagement_score: {
        Args: { p_days?: number; p_supporter_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client"
      comment_status: "pending" | "responded" | "ignored"
      llm_provider:
        | "groq"
        | "openai"
        | "anthropic"
        | "gemini"
        | "mistral"
        | "cohere"
      sentiment_type: "positive" | "neutral" | "negative"
      supporter_classification:
        | "apoiador_ativo"
        | "apoiador_passivo"
        | "neutro"
        | "critico"
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
      app_role: ["admin", "client"],
      comment_status: ["pending", "responded", "ignored"],
      llm_provider: [
        "groq",
        "openai",
        "anthropic",
        "gemini",
        "mistral",
        "cohere",
      ],
      sentiment_type: ["positive", "neutral", "negative"],
      supporter_classification: [
        "apoiador_ativo",
        "apoiador_passivo",
        "neutro",
        "critico",
      ],
    },
  },
} as const
