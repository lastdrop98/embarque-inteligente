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
      papeis_utilizador: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      paragens: {
        Row: {
          created_at: string
          hora_prevista: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          ordem: number
          rota_id: string
        }
        Insert: {
          created_at?: string
          hora_prevista?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          ordem?: number
          rota_id: string
        }
        Update: {
          created_at?: string
          hora_prevista?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          ordem?: number
          rota_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paragens_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      passageiros: {
        Row: {
          contacto: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          contacto?: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          contacto?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      perfis: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          nome?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      registos_embarque: {
        Row: {
          created_at: string
          id: string
          motivo_recusa: string | null
          registado_por: string | null
          resultado: Database["public"]["Enums"]["resultado_registo"]
          rota_id: string | null
          tipo: Database["public"]["Enums"]["tipo_registo"]
          viagem_passageiro_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          motivo_recusa?: string | null
          registado_por?: string | null
          resultado: Database["public"]["Enums"]["resultado_registo"]
          rota_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_registo"]
          viagem_passageiro_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          motivo_recusa?: string | null
          registado_por?: string | null
          resultado?: Database["public"]["Enums"]["resultado_registo"]
          rota_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_registo"]
          viagem_passageiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registos_embarque_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registos_embarque_viagem_passageiro_id_fkey"
            columns: ["viagem_passageiro_id"]
            isOneToOne: false
            referencedRelation: "viagens_passageiro"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas: {
        Row: {
          created_at: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          motorista_id: string | null
          nome: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          motorista_id?: string | null
          nome: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          motorista_id?: string | null
          nome?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rotas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          created_at: string
          id: string
          lugares: number
          matricula: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          lugares?: number
          matricula?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          lugares?: number
          matricula?: string
          nome?: string
        }
        Relationships: []
      }
      viagens_passageiro: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["estado_viagem"]
          id: string
          paragem_desembarque_id: string | null
          paragem_embarque_id: string | null
          passageiro_id: string
          rota_id: string
          token_qr: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_viagem"]
          id?: string
          paragem_desembarque_id?: string | null
          paragem_embarque_id?: string | null
          passageiro_id: string
          rota_id: string
          token_qr?: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_viagem"]
          id?: string
          paragem_desembarque_id?: string | null
          paragem_embarque_id?: string | null
          passageiro_id?: string
          rota_id?: string
          token_qr?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagens_passageiro_paragem_desembarque_id_fkey"
            columns: ["paragem_desembarque_id"]
            isOneToOne: false
            referencedRelation: "paragens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_passageiro_paragem_embarque_id_fkey"
            columns: ["paragem_embarque_id"]
            isOneToOne: false
            referencedRelation: "paragens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_passageiro_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viagens_passageiro_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pode_ver_rota: { Args: { _rota_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "operador" | "motorista" | "admin" | "passageiro"
      estado_viagem: "pendente" | "a_bordo" | "concluida" | "recusada"
      resultado_registo: "aprovado" | "recusado"
      tipo_registo: "embarque" | "desembarque"
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
      app_role: ["operador", "motorista", "admin", "passageiro"],
      estado_viagem: ["pendente", "a_bordo", "concluida", "recusada"],
      resultado_registo: ["aprovado", "recusado"],
      tipo_registo: ["embarque", "desembarque"],
    },
  },
} as const
