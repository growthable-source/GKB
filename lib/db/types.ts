export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      article_revisions: {
        Row: {
          article_id: string
          author_id: string | null
          body_json: Json
          created_at: string
          id: string
          title: string
        }
        Insert: {
          article_id: string
          author_id?: string | null
          body_json: Json
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          article_id?: string
          author_id?: string | null
          body_json?: Json
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_search: {
        Row: {
          article_id: string
          body_text: string
          embedding: string | null
          help_center_id: string
          indexed_at: string
          search_vector: unknown
          title: string
        }
        Insert: {
          article_id: string
          body_text: string
          embedding?: string | null
          help_center_id: string
          indexed_at?: string
          search_vector?: unknown
          title: string
        }
        Update: {
          article_id?: string
          body_text?: string
          embedding?: string | null
          help_center_id?: string
          indexed_at?: string
          search_vector?: unknown
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_search_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_search_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string | null
          body_html: string
          body_json: Json
          collection_id: string | null
          created_at: string
          excerpt: string | null
          id: string
          origin_help_center_id: string | null
          published_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_html: string
          body_json: Json
          collection_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          origin_help_center_id?: string | null
          published_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_html?: string
          body_json?: Json
          collection_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          origin_help_center_id?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_origin_help_center_id_fkey"
            columns: ["origin_help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_domains: {
        Row: {
          created_at: string
          help_center_id: string
          hostname: string
          id: string
          status: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          help_center_id: string
          hostname: string
          id?: string
          status?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          help_center_id?: string
          hostname?: string
          id?: string
          status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_domains_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      help_center_article_exclusions: {
        Row: {
          article_id: string
          created_at: string
          help_center_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          help_center_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          help_center_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_center_article_exclusions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_center_article_exclusions_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      help_center_articles: {
        Row: {
          article_id: string
          body_html_override: string | null
          body_json_override: Json | null
          collection_override_id: string | null
          created_at: string
          help_center_id: string
          is_hidden: boolean
          position: number
          title_override: string | null
        }
        Insert: {
          article_id: string
          body_html_override?: string | null
          body_json_override?: Json | null
          collection_override_id?: string | null
          created_at?: string
          help_center_id: string
          is_hidden?: boolean
          position?: number
          title_override?: string | null
        }
        Update: {
          article_id?: string
          body_html_override?: string | null
          body_json_override?: Json | null
          collection_override_id?: string | null
          created_at?: string
          help_center_id?: string
          is_hidden?: boolean
          position?: number
          title_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_center_articles_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_center_articles_collection_override_id_fkey"
            columns: ["collection_override_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_center_articles_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      help_center_audience_members: {
        Row: {
          created_at: string
          email: string
          help_center_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          help_center_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          help_center_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_center_audience_members_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      help_center_collections: {
        Row: {
          audience: string
          collection_id: string
          description_override: string | null
          help_center_id: string
          is_hidden: boolean
          position: number
          title_override: string | null
        }
        Insert: {
          audience?: string
          collection_id: string
          description_override?: string | null
          help_center_id: string
          is_hidden?: boolean
          position?: number
          title_override?: string | null
        }
        Update: {
          audience?: string
          collection_id?: string
          description_override?: string | null
          help_center_id?: string
          is_hidden?: boolean
          position?: number
          title_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_center_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_center_collections_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      help_centers: {
        Row: {
          auto_include_new_articles: boolean
          cloned_from_id: string | null
          created_at: string
          favicon_url: string | null
          font_family: string | null
          heading_font: string | null
          hero_angle: number
          hero_from_hex: string | null
          hero_style: string
          hero_to_hex: string | null
          id: string
          is_base: boolean
          logo_url: string | null
          name: string
          primary_hex: string
          secondary_hex: string
          settings: Json
          slug: string
          tiles_per_row: number
          updated_at: string
          visibility: string
        }
        Insert: {
          auto_include_new_articles?: boolean
          cloned_from_id?: string | null
          created_at?: string
          favicon_url?: string | null
          font_family?: string | null
          heading_font?: string | null
          hero_angle?: number
          hero_from_hex?: string | null
          hero_style?: string
          hero_to_hex?: string | null
          id?: string
          is_base?: boolean
          logo_url?: string | null
          name: string
          primary_hex?: string
          secondary_hex?: string
          settings?: Json
          slug: string
          tiles_per_row?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          auto_include_new_articles?: boolean
          cloned_from_id?: string | null
          created_at?: string
          favicon_url?: string | null
          font_family?: string | null
          heading_font?: string | null
          hero_angle?: number
          hero_from_hex?: string | null
          hero_style?: string
          hero_to_hex?: string | null
          id?: string
          is_base?: boolean
          logo_url?: string | null
          name?: string
          primary_hex?: string
          secondary_hex?: string
          settings?: Json
          slug?: string
          tiles_per_row?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_centers_cloned_from_id_fkey"
            columns: ["cloned_from_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      import_items: {
        Row: {
          article_id: string | null
          created_at: string
          error: string | null
          id: string
          import_id: string
          source_ref: string
          status: string
          title: string | null
        }
        Insert: {
          article_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          import_id: string
          source_ref: string
          status?: string
          title?: string | null
        }
        Update: {
          article_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          import_id?: string
          source_ref?: string
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          help_center_id: string | null
          id: string
          source: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          help_center_id?: string | null
          id?: string
          source: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          help_center_id?: string | null
          id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          help_center_id: string | null
          id: string
          invited_by: string | null
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          help_center_id?: string | null
          id?: string
          invited_by?: string | null
          role: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          help_center_id?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          help_center_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          help_center_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          help_center_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_snapshots: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload: Json
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
        }
        Relationships: []
      }
      signups: {
        Row: {
          agency_name: string | null
          branding: Json
          center_name: string | null
          center_slug: string | null
          claimed_at: string | null
          company_size: string | null
          consented_at: string | null
          created_at: string
          delivered_at: string | null
          email: string
          full_name: string
          help_center_id: string | null
          id: string
          link_sent_at: string | null
          marketing_opt_in: boolean
          role: string | null
          step: string
          subaccount_count: string | null
          token: string
          updated_at: string
        }
        Insert: {
          agency_name?: string | null
          branding?: Json
          center_name?: string | null
          center_slug?: string | null
          claimed_at?: string | null
          company_size?: string | null
          consented_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email: string
          full_name: string
          help_center_id?: string | null
          id?: string
          link_sent_at?: string | null
          marketing_opt_in?: boolean
          role?: string | null
          step?: string
          subaccount_count?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          agency_name?: string | null
          branding?: Json
          center_name?: string | null
          center_slug?: string | null
          claimed_at?: string | null
          company_size?: string | null
          consented_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string
          full_name?: string
          help_center_id?: string | null
          id?: string
          link_sent_at?: string | null
          marketing_opt_in?: boolean
          role?: string | null
          step?: string
          subaccount_count?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signups_help_center_id_fkey"
            columns: ["help_center_id"]
            isOneToOne: false
            referencedRelation: "help_centers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_help_center: {
        Args: { p_help_center_id: string; p_limit?: number; p_query: string }
        Returns: {
          article_id: string
          headline: string
          rank: number
          slug: string
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

