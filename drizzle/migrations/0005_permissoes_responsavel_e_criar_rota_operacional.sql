-- Embarque Inteligente — permissões de responsável de grupo e criação segura de rotas
-- A migration é idempotente e não remove dados existentes.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'responsavel_grupo';

CREATE OR REPLACE FUNCTION public.criar_rota_operacional(
  _nome text,
  _veiculo_id uuid,
  _motorista_id uuid,
  _ponto_partida_id uuid,
  _ponto_chegada_id uuid,
  _paragem_id uuid,
  _hora_inicio time without time zone,
  _hora_fim time without time zone,
  _passageiros_previstos integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _rota_id uuid;
  _partida_nome text;
  _chegada_nome text;
  _paragem_nome text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar rotas';
  END IF;

  IF _ponto_partida_id IS NULL OR _ponto_chegada_id IS NULL THEN
    RAISE EXCEPTION 'O ponto de partida e o ponto de chegada são obrigatórios';
  END IF;

  IF _ponto_partida_id = _ponto_chegada_id THEN
    RAISE EXCEPTION 'A partida e a chegada devem ser diferentes';
  END IF;

  IF _paragem_id IS NOT NULL
     AND (_paragem_id = _ponto_partida_id OR _paragem_id = _ponto_chegada_id) THEN
    RAISE EXCEPTION 'A paragem intermédia deve ser diferente da partida e da chegada';
  END IF;

  SELECT nome INTO _partida_nome
  FROM public.pontos_predefinidos
  WHERE id = _ponto_partida_id AND activo = true;

  IF _partida_nome IS NULL THEN
    RAISE EXCEPTION 'Ponto de partida inválido ou inactivo';
  END IF;

  SELECT nome INTO _chegada_nome
  FROM public.pontos_predefinidos
  WHERE id = _ponto_chegada_id AND activo = true;

  IF _chegada_nome IS NULL THEN
    RAISE EXCEPTION 'Ponto de chegada inválido ou inactivo';
  END IF;

  IF _paragem_id IS NOT NULL THEN
    SELECT nome INTO _paragem_nome
    FROM public.pontos_predefinidos
    WHERE id = _paragem_id AND activo = true;

    IF _paragem_nome IS NULL THEN
      RAISE EXCEPTION 'Paragem intermédia inválida ou inactiva';
    END IF;
  END IF;

  IF _passageiros_previstos IS NOT NULL AND _passageiros_previstos < 0 THEN
    RAISE EXCEPTION 'O número de passageiros previstos não pode ser negativo';
  END IF;

  INSERT INTO public.rotas (
    nome, veiculo_id, motorista_id, hora_inicio, hora_fim,
    estado, passageiros_previstos, embarque_fechado
  )
  VALUES (
    COALESCE(NULLIF(trim(_nome), ''), _partida_nome || ' → ' || _chegada_nome),
    _veiculo_id, _motorista_id, _hora_inicio, _hora_fim,
    'rascunho', _passageiros_previstos, false
  )
  RETURNING id INTO _rota_id;

  INSERT INTO public.paragens (rota_id, ordem, nome, hora_prevista)
  VALUES (_rota_id, 1, _partida_nome, _hora_inicio);

  IF _paragem_id IS NOT NULL THEN
    INSERT INTO public.paragens (rota_id, ordem, nome, hora_prevista)
    VALUES (_rota_id, 2, _paragem_nome, NULL);
  END IF;

  INSERT INTO public.paragens (rota_id, ordem, nome, hora_prevista)
  VALUES (
    _rota_id,
    CASE WHEN _paragem_id IS NULL THEN 2 ELSE 3 END,
    _chegada_nome,
    _hora_fim
  );

  RETURN _rota_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_rota_operacional(
  text, uuid, uuid, uuid, uuid, uuid, time without time zone, time without time zone, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.criar_rota_operacional(
  text, uuid, uuid, uuid, uuid, uuid, time without time zone, time without time zone, integer
) TO authenticated;
