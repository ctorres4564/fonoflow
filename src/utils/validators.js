export const isValidEmail = (email) => /\S+@\S+\.\S+/.test(email)

export const onlyDigits = (value = '') => value.replace(/\D/g, '')

export const formatPhone = (value = '') => {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1')
  }

  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1')
}

export function validatePatientForm(values) {
  const errors = {}

  if (!values.name?.trim()) errors.name = 'Nome é obrigatório.'
  if (!values.address?.trim()) errors.address = 'Endereço é obrigatório.'
  if (!values.phone?.trim()) {
    errors.phone = 'Telefone é obrigatório.'
  } else if (onlyDigits(values.phone).length < 10) {
    errors.phone = 'Telefone inválido.'
  }
  if (!values.birthDate) errors.birthDate = 'Data de nascimento é obrigatória.'
  if (!values.guardian?.trim()) errors.guardian = 'Nome do responsável é obrigatório.'
  if (!values.professionalName?.trim()) errors.professionalName = 'Nome da profissional é obrigatório.'
  if (!values.crfa?.trim()) errors.crfa = 'CRFa é obrigatório.'

  const sessionsPerWeek = Number(values.sessionsPerWeek)
  const totalSessions = Number(values.totalSessions)
  const completedSessions = Number(values.completedSessions)

  if (Number.isNaN(sessionsPerWeek) || sessionsPerWeek <= 0) {
    errors.sessionsPerWeek = 'Sessões por semana deve ser maior que zero.'
  }

  if (Number.isNaN(totalSessions) || totalSessions <= 0) {
    errors.totalSessions = 'Total contratado deve ser maior que zero.'
  }

  if (Number.isNaN(completedSessions) || completedSessions < 0) {
    errors.completedSessions = 'Sessões realizadas não pode ser negativo.'
  }

  if (!errors.totalSessions && !errors.completedSessions && completedSessions > totalSessions) {
    errors.completedSessions = 'Sessões realizadas não pode exceder o total contratado.'
  }

  return errors
}
