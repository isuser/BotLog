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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          agent_id: string | null
          api_key_id: string | null
          changes: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          project_id: string | null
          seq: number
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          agent_id?: string | null
          api_key_id?: string | null
          changes?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          project_id?: string | null
          seq?: never
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          agent_id?: string | null
          api_key_id?: string | null
          changes?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          project_id?: string | null
          seq?: never
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_key"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      agent: {
        Row: {
          archived_at: string | null
          avatar: string | null
          created_at: string
          description: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          avatar?: string | null
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_user_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          archived_at?: string | null
          avatar?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key: {
        Row: {
          agent_id: string
          created_at: string
          hash: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          hash: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          hash?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_key_agent_id_workspace_id_fkey"
            columns: ["agent_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      board_column: {
        Row: {
          counts_as: Database["public"]["Enums"]["task_status"]
          created_at: string
          hidden: boolean
          id: string
          kind: Database["public"]["Enums"]["board_column_kind"]
          name: string
          position: string
          project_id: string
          updated_at: string
        }
        Insert: {
          counts_as?: Database["public"]["Enums"]["task_status"]
          created_at?: string
          hidden?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["board_column_kind"]
          name: string
          position: string
          project_id: string
          updated_at?: string
        }
        Update: {
          counts_as?: Database["public"]["Enums"]["task_status"]
          created_at?: string
          hidden?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["board_column_kind"]
          name?: string
          position?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_column_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      comment: {
        Row: {
          author_agent_id: string | null
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_agent_id?: string | null
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_agent_id?: string | null
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_author_agent_id_fkey"
            columns: ["author_agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      epic: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string
          id: string
          project_id: string
          status: Database["public"]["Enums"]["epic_status"]
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["epic_status"]
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["epic_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "epic_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      label: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          theme: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name?: string
          theme?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          theme?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      project: {
        Row: {
          created_at: string
          description: string
          done_window_days: number
          id: string
          key: string
          name: string
          task_counter: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          done_window_days?: number
          id?: string
          key: string
          name: string
          task_counter?: number
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          done_window_days?: number
          id?: string
          key?: string
          name?: string
          task_counter?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      task: {
        Row: {
          archived_at: string | null
          assignee_agent_id: string | null
          assignee_user_id: string | null
          column_id: string
          created_at: string
          description: string
          done_at: string | null
          due_date: string | null
          epic_id: string | null
          id: string
          number: number
          position: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          assignee_agent_id?: string | null
          assignee_user_id?: string | null
          column_id?: string
          created_at?: string
          description?: string
          done_at?: string | null
          due_date?: string | null
          epic_id?: string | null
          id?: string
          number: number
          position: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          assignee_agent_id?: string | null
          assignee_user_id?: string | null
          column_id?: string
          created_at?: string
          description?: string
          done_at?: string | null
          due_date?: string | null
          epic_id?: string | null
          id?: string
          number?: number
          position?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_column_fkey"
            columns: ["column_id", "project_id"]
            isOneToOne: false
            referencedRelation: "board_column"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "task_assignee_agent_id_fkey"
            columns: ["assignee_agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_epic_id_project_id_fkey"
            columns: ["epic_id", "project_id"]
            isOneToOne: false
            referencedRelation: "epic"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "task_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
        ]
      }
      task_label: {
        Row: {
          created_at: string
          label_id: string
          project_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          label_id: string
          project_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          label_id?: string
          project_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_label_label_id_project_id_fkey"
            columns: ["label_id", "project_id"]
            isOneToOne: false
            referencedRelation: "label"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "task_label_task_id_project_id_fkey"
            columns: ["task_id", "project_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      workspace: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      column_for_status: {
        Args: {
          p_project_id: string
          p_status: Database["public"]["Enums"]["task_status"]
        }
        Returns: string
      }
      delete_board_column: {
        Args: { p_column_id: string; p_move_to: string }
        Returns: undefined
      }
      hit_rate_limit: {
        Args: never
        Returns: {
          hits: number
          reset_at: string
        }[]
      }
      set_task_labels: {
        Args: { p_label_ids: string[]; p_task_id: string; p_version: number }
        Returns: number
      }
    }
    Enums: {
      actor_type: "human" | "ai" | "system"
      board_column_kind: "backlog" | "todo" | "in_progress" | "done" | "custom"
      epic_status: "planned" | "in_progress" | "done" | "canceled"
      task_priority: "none" | "low" | "medium" | "high" | "urgent"
      task_status: "backlog" | "todo" | "in_progress" | "done"
      task_type: "feature" | "bug" | "improvement"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      actor_type: ["human", "ai", "system"],
      board_column_kind: ["backlog", "todo", "in_progress", "done", "custom"],
      epic_status: ["planned", "in_progress", "done", "canceled"],
      task_priority: ["none", "low", "medium", "high", "urgent"],
      task_status: ["backlog", "todo", "in_progress", "done"],
      task_type: ["feature", "bug", "improvement"],
    },
  },
} as const
