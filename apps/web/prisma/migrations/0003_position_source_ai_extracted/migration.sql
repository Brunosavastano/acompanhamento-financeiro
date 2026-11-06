-- Proveniência dos saldos: "ai_extracted" marca o saldo que veio do leitor de
-- prints e foi salvo pelo botão humano "Salvar e revisar" sem mudar o valor lido.
-- Só acrescenta um valor ao enum: não altera nem reescreve linhas existentes.
ALTER TYPE "PositionSource" ADD VALUE IF NOT EXISTS 'ai_extracted';
