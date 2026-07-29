"""
Constantes operacionais compartilhadas.
Monitoramento sem filtro de grupo — todos os setores visíveis.
"""

# Sem lista branca de grupos — tudo do Zammad é monitorado.
# Mantido apenas para não quebrar imports existentes (frozenset vazio = sem filtro).
NOC_ALLOWED_GROUPS: frozenset[str] = frozenset()
NOC_CARD1_EXCLUDED_GROUPS: frozenset[str] = frozenset()
NOC_EXCLUDED_OWNER_IDS: frozenset[int] = frozenset()

# Grupos excluídos da carga por analista (lista negra — vazia = tudo incluído)
NOC_EXCLUDED_GROUPS_LOAD: frozenset[str] = frozenset()
