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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      avaliacoes: {
        Row: {
          comentario: string | null
          created_at: string
          id: string
          nota: number
          viagem_id: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          id?: string
          nota: number
          viagem_id: string
        }
        Update: {
          comentario?: string | null
          created_at?: string
          id?: string
          nota?: number
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: true
            referencedRelation: "viagens_passageiro"
            referencedColumns: ["id"]
          },
        ]
      }
      delegacoes: {
        Row: {
          contacto: string | null
          created_at: string
          id: string
          nome: string
          tipo: string | null
        }
        Insert: {
          contacto?: string | null
          created_at?: string
          id?: string
          nome: string
          tipo?: string | null
        }
        Update: {
          contacto?: string | null
          created_at?: string
          id?: string
          nome?: string
          tipo?: string | null
        }
        Relationships: []
      }
      historico_ocultos: {
        Row: {
          created_at: string
          entidade_id: string
          entidade_tipo: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entidade_id: string
          entidade_tipo: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      incidentes: {
        Row: {
          created_at: string
          descricao: string
          estado: string
          id: string
          motorista_id: string | null
          rota_id: string | null
          tipo: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          estado?: string
          id?: string
          motorista_id?: string | null
          rota_id?: string | null
          tipo?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          estado?: string
          id?: string
          motorista_id?: string | null
          rota_id?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidentes_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          mensagem: string
          referencia_id: string | null
          referencia_tipo: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
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
          categoria: Database["public"]["Enums"]["categoria_passageiro"]
          contacto: string
          created_at: string
          delegacao_id: string | null
          id: string
          nome: string
          user_id: string | null
          vip: boolean
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_passageiro"]
          contacto?: string
          created_at?: string
          delegacao_id?: string | null
          id?: string
          nome: string
          user_id?: string | null
          vip?: boolean
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_passageiro"]
          contacto?: string
          created_at?: string
          delegacao_id?: string | null
          id?: string
          nome?: string
          user_id?: string | null
          vip?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "passageiros_delegacao_id_fkey"
            columns: ["delegacao_id"]
            isOneToOne: false
            referencedRelation: "delegacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_transporte: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_passageiro"]
          created_at: string
          criado_por: string | null
          data_viagem: string
          delegacao_id: string | null
          destino: string
          estado: Database["public"]["Enums"]["estado_pedido"]
          hora: string | null
          id: string
          num_passageiros: number
          observacoes: string | null
          origem: string
          passageiro_id: string | null
          rota_id: string | null
          tipo_viatura: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_passageiro"]
          created_at?: string
          criado_por?: string | null
          data_viagem: string
          delegacao_id?: string | null
          destino: string
          estado?: Database["public"]["Enums"]["estado_pedido"]
          hora?: string | null
          id?: string
          num_passageiros?: number
          observacoes?: string | null
          origem: string
          passageiro_id?: string | null
          rota_id?: string | null
          tipo_viatura?: string | null
          titulo?: string
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_passageiro"]
          created_at?: string
          criado_por?: string | null
          data_viagem?: string
          delegacao_id?: string | null
          destino?: string
          estado?: Database["public"]["Enums"]["estado_pedido"]
          hora?: string | null
          id?: string
          num_passageiros?: number
          observacoes?: string | null
          origem?: string
          passageiro_id?: string | null
          rota_id?: string | null
          tipo_viatura?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_transporte_delegacao_id_fkey"
            columns: ["delegacao_id"]
            isOneToOne: false
            referencedRelation: "delegacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_transporte_passageiro_id_fkey"
            columns: ["passageiro_id"]
            isOneToOne: false
            referencedRelation: "passageiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_transporte_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string
          id: string
          nome?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      pontos_predefinidos: {
        Row: {
          activo: boolean
          coordenadas_verificadas: boolean
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          coordenadas_verificadas?: boolean
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          coordenadas_verificadas?: boolean
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      registo_auditoria: {
        Row: {
          alterado_por: string | null
          created_at: string
          id: string
          papel_anterior: Database["public"]["Enums"]["app_role"] | null
          papel_novo: Database["public"]["Enums"]["app_role"] | null
          utilizador_alvo: string
        }
        Insert: {
          alterado_por?: string | null
          created_at?: string
          id?: string
          papel_anterior?: Database["public"]["Enums"]["app_role"] | null
          papel_novo?: Database["public"]["Enums"]["app_role"] | null
          utilizador_alvo: string
        }
        Update: {
          alterado_por?: string | null
          created_at?: string
          id?: string
          papel_anterior?: Database["public"]["Enums"]["app_role"] | null
          papel_novo?: Database["public"]["Enums"]["app_role"] | null
          utilizador_alvo?: string
        }
        Relationships: []
      }
      registos_embarque: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
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
          latitude?: number | null
          longitude?: number | null
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
          latitude?: number | null
          longitude?: number | null
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
          data_servico: string | null
          data_viagem: string | null
          distancia_km: number | null
          embarque_fechado: boolean
          estado: Database["public"]["Enums"]["estado_rota"]
          hora_chegada_real: string | null
          hora_fim: string | null
          hora_inicio: string | null
          hora_partida_real: string | null
          id: string
          motorista_id: string | null
          nome: string
          paragem_id: string | null
          passageiros_previstos: number | null
          pedido_id: string | null
          ponto_chegada_id: string | null
          ponto_partida_id: string | null
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          data_servico?: string | null
          data_viagem?: string | null
          distancia_km?: number | null
          embarque_fechado?: boolean
          estado?: Database["public"]["Enums"]["estado_rota"]
          hora_chegada_real?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          hora_partida_real?: string | null
          id?: string
          motorista_id?: string | null
          nome: string
          paragem_id?: string | null
          passageiros_previstos?: number | null
          pedido_id?: string | null
          ponto_chegada_id?: string | null
          ponto_partida_id?: string | null
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          data_servico?: string | null
          data_viagem?: string | null
          distancia_km?: number | null
          embarque_fechado?: boolean
          estado?: Database["public"]["Enums"]["estado_rota"]
          hora_chegada_real?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          hora_partida_real?: string | null
          id?: string
          motorista_id?: string | null
          nome?: string
          paragem_id?: string | null
          passageiros_previstos?: number | null
          pedido_id?: string | null
          ponto_chegada_id?: string | null
          ponto_partida_id?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rotas_paragem_id_fkey"
            columns: ["paragem_id"]
            isOneToOne: false
            referencedRelation: "pontos_predefinidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_transporte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_ponto_chegada_id_fkey"
            columns: ["ponto_chegada_id"]
            isOneToOne: false
            referencedRelation: "pontos_predefinidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_ponto_partida_id_fkey"
            columns: ["ponto_partida_id"]
            isOneToOne: false
            referencedRelation: "pontos_predefinidos"
            referencedColumns: ["id"]
          },
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
          estado: string
          id: string
          latitude: number | null
          longitude: number | null
          lugares: number
          marca: string | null
          matricula: string
          modelo: string | null
          nome: string
          posicao_updated_at: string | null
        }
        Insert: {
          created_at?: string
          estado?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          lugares?: number
          marca?: string | null
          matricula?: string
          modelo?: string | null
          nome: string
          posicao_updated_at?: string | null
        }
        Update: {
          created_at?: string
          estado?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          lugares?: number
          marca?: string | null
          matricula?: string
          modelo?: string | null
          nome?: string
          posicao_updated_at?: string | null
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
      cancelar_pedido: { Args: { _pedido_id: string }; Returns: undefined }
      concluir_rota_segura: { Args: { _rota_id: string }; Returns: Json }
      conta_activa: { Args: never; Returns: boolean }
      criar_rota_operacional: {
        Args: {
          _hora_fim?: string
          _hora_inicio?: string
          _motorista_id?: string
          _nome?: string
          _paragem_id?: string
          _passageiros_previstos?: number
          _ponto_chegada_id?: string
          _ponto_partida_id?: string
          _veiculo_id?: string
        }
        Returns: string
      }
      eliminar_meus_pedidos: { Args: never; Returns: number }
      eliminar_pedido: { Args: { _pedido_id: string }; Returns: undefined }
      eliminar_rota_segura: { Args: { _rota_id: string }; Returns: undefined }
      eliminar_todas_rotas_segura: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iniciar_rota_segura: { Args: { _rota_id: string }; Returns: Json }
      limpar_dados_apresentacao: { Args: never; Returns: Json }
      media_avaliacoes: {
        Args: never
        Returns: {
          media: number
          total: number
        }[]
      }
      notificar_evento: {
        Args: {
          p_mensagem: string
          p_referencia_id: string
          p_referencia_tipo: string
          p_tipo: string
          p_user_ids?: string[]
        }
        Returns: undefined
      }
      notificar_novo_pedido: { Args: { _pedido_id: string }; Returns: number }
      pode_gerir_rota: { Args: { _rota_id: string }; Returns: boolean }
      pode_ver_rota: { Args: { _rota_id: string }; Returns: boolean }
      pontos_disponiveis: {
        Args: { _data: string }
        Returns: {
          nome: string
        }[]
      }
      reservar_viagem: {
        Args: {
          _desembarque_id: string
          _embarque_id: string
          _rota_id: string
        }
        Returns: string
      }
      reservar_viagem_passageiro: {
        Args: {
          _paragem_desembarque_id: string
          _paragem_embarque_id: string
          _rota_id: string
        }
        Returns: string
      }
      rotas_disponiveis: {
        Args: { _data: string; _destino: string; _origem: string }
        Returns: {
          hora_chegada: string
          hora_partida: string
          lugares_livres: number
          paragem_desembarque_id: string
          paragem_embarque_id: string
          rota_id: string
          rota_nome: string
          veiculo: string
        }[]
      }
      viagens_disponiveis_passageiro: {
        Args: { _data: string; _destino: string; _origem: string }
        Returns: {
          data_viagem: string
          embarque_fecha_em: string
          hora_chegada: string
          hora_embarque: string
          lugares: number
          lugares_livres: number
          matricula: string
          paragem_desembarque: string
          paragem_desembarque_id: string
          paragem_embarque: string
          paragem_embarque_id: string
          rota_id: string
          rota_nome: string
          veiculo: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "operador"
        | "motorista"
        | "admin"
        | "passageiro"
        | "responsavel_grupo"
      categoria_passageiro:
        | "atleta"
        | "coach"
        | "official"
        | "media"
        | "sponsor"
        | "guest"
        | "vip"
        | "staff"
        | "voluntario"
        | "arbitro"
        | "independente"
      estado_pedido:
        | "rascunho"
        | "submetido"
        | "em_analise"
        | "aprovado"
        | "alocado"
        | "agendado"
        | "rejeitado"
        | "cancelado"
      estado_rota:
        | "rascunho"
        | "agendada"
        | "embarque_aberto"
        | "embarque_fechado"
        | "em_curso"
        | "concluida"
        | "cancelada"
      estado_viagem:
        | "pendente"
        | "a_bordo"
        | "concluida"
        | "recusada"
        | "desembarcado"
        | "nao_compareceu"
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
      app_role: [
        "operador",
        "motorista",
        "admin",
        "passageiro",
        "responsavel_grupo",
      ],
      categoria_passageiro: [
        "atleta",
        "coach",
        "official",
        "media",
        "sponsor",
        "guest",
        "vip",
        "staff",
        "voluntario",
        "arbitro",
        "independente",
      ],
      estado_pedido: [
        "rascunho",
        "submetido",
        "em_analise",
        "aprovado",
        "alocado",
        "agendado",
        "rejeitado",
        "cancelado",
      ],
      estado_rota: [
        "rascunho",
        "agendada",
        "embarque_aberto",
        "embarque_fechado",
        "em_curso",
        "concluida",
        "cancelada",
      ],
      estado_viagem: [
        "pendente",
        "a_bordo",
        "concluida",
        "recusada",
        "desembarcado",
        "nao_compareceu",
      ],
      resultado_registo: ["aprovado", "recusado"],
      tipo_registo: ["embarque", "desembarque"],
    },
  },
} as const
