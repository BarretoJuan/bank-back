import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE } from "../supabase/supabase.module";
import { transactionType } from "src/transaction/dto/create-transaction.dto";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: SupabaseClient,
  ) {}

  async ensureUser(authUser: {
    id: string;
    email?: string | null;
    firstName: string;
    lastName: string;
  }) {

    const payload = {
      id: authUser.id,
      email: authUser.email,
      first_name: authUser.firstName,
      last_name: authUser.lastName,
    };
    const { error } = await this.supabase
      .from("user")
      .upsert(payload, { onConflict: "id", ignoreDuplicates: false });
    if (error) this.logger.warn(`ensureUser upsert failed: ${error.message}`);
  }

  async depositOrWithdraw(depositOrWithdraw: {
    amount: number;
    email: string;
    type: transactionType;
    recipientEmail?: string;
  }) {
    const { amount, email, type } = depositOrWithdraw;

    const { data: userRow, error: fetchErr } = await this.supabase
      .from("user")
      .select("id,balance")
      .eq("email", email)
      .single();

    if (fetchErr) {
      this.logger.warn(`fetch user balance failed: ${fetchErr.message}`);
      throw new NotFoundException("User not found");
    }

    const currentBalance = userRow.balance ?? 0;
    let newBalance = currentBalance;

    if (type === transactionType.DEPOSIT) {
      newBalance = currentBalance + amount;
    } else if (type === transactionType.WITHDRAW) {
      if (amount > currentBalance) {
        throw new BadRequestException("Insufficient funds");
      }
      newBalance = currentBalance - amount;
    } else {
      throw new BadRequestException("Invalid transaction type");
    }

    let updatedUser: {
      id: string;
      balance: number;
    } | null = null;
    let balanceUpdated = false;

    try {
      const { data: updatedUserRow, error: updateErr } = await this.supabase
        .from("user")
        .update({ balance: newBalance })
        .eq("id", userRow.id)
        .eq("balance", currentBalance)
        .select("id,balance")
        .single();

      if (updateErr || !updatedUserRow) {
        this.logger.warn(
          `balance update failed or concurrency conflict: ${updateErr?.message || "stale balance"}`,
        );
        throw updateErr
          ? new ConflictException("Failed to update balance")
          : new ConflictException("Balance changed, retry");
      }

      updatedUser = updatedUserRow;
      balanceUpdated = true;

      const { data: txRow, error: txErr } = await this.supabase
        .from("transaction")
        .insert([
          {
            amount,
            recipient_id: userRow.id,
            sender_id: userRow.id,
            type,
          },
        ])
        .select()
        .single();

      if (txErr || !txRow) {
        this.logger.warn(`transaction insert failed: ${txErr?.message}`);
        throw new InternalServerErrorException("Failed to record transaction");
      }

      return {
        transaction: txRow,
        balance: updatedUser.balance,
      };
    } catch (err) {
      if (balanceUpdated) {
        const { error: rollbackErr } = await this.supabase
          .from("user")
          .update({ balance: currentBalance })
          .eq("id", userRow.id)
          .eq("balance", newBalance);
        if (rollbackErr) {
          this.logger.error(
            `balance rollback failed: ${rollbackErr.message} (user ${userRow.id})`,
          );
        }
      }
      throw err;
    }
  }

  async getTransactionHistory(email: string, type?: transactionType) {
    const userData = await this.getProfile(email);

    const { data: txRows, error: fetchErr } = await this.supabase
      .from("transaction")
      .select(
        [
          "id",
          "amount",
          "type",
          "created_at",
          "recipient_id",
          "sender_id",
          "recipient:recipient_id(id,email)",
          "sender:sender_id(id,email)",
        ].join(","),
      )

      .or(`recipient_id.eq.${userData.id},sender_id.eq.${userData.id}`)
      .order("created_at", { ascending: false });

    if (fetchErr) {
      this.logger.warn(`fetch transaction history failed: ${fetchErr.message}`);
      throw new NotFoundException("Transaction history not found");
    }

    if (!txRows) return [];

    interface TxRow {
      id: string;
      amount: number;
      type: transactionType;
      created_at: string;
      sender_id: string | null;
      recipient_id: string | null;
      sender?: { id: string; email: string | null } | null;
      recipient?: { id: string; email: string | null } | null;
    }

    const rows: TxRow[] = (txRows as unknown as TxRow[]) || [];

    const filtered = type ? rows.filter((tx) => tx.type === type) : rows;

    const enriched = filtered.map((tx) => {
      const senderEmail = tx.sender?.email ?? null;
      const recipientEmail = tx.recipient?.email ?? null;

      let isPositive = false;
      if (tx.type === transactionType.DEPOSIT) {
        isPositive = true;
      } else if (tx.type === transactionType.WITHDRAW) {
        isPositive = false;
      } else if (tx.type === transactionType.TRANSFER) {
        if (recipientEmail === email) isPositive = true;
        else if (senderEmail === email) isPositive = false;
      }

      const signedAmount = isPositive ? tx.amount : -Math.abs(tx.amount);

      return {
        id: tx.id,
        amount: signedAmount,
        type: tx.type,
        created_at: tx.created_at,
        sender_id: tx.sender_id,
        recipient_id: tx.recipient_id,
        senderEmail,
        recipientEmail,
        isPositive,
      };
    });

    return enriched;
  }

  async getProfile(email: string) {
    const { data: userRow, error: fetchErr } = await this.supabase
      .from("user")
      .select("id,email,balance,first_name,last_name")
      .eq("email", email)
      .single();

    if (fetchErr) {
      this.logger.warn(`fetch user profile failed: ${fetchErr.message}`);
      throw new NotFoundException("Usuario no encontrado");
    }

    return userRow;
  }

  async transfer(transferData: {
    amount: number;
    email: string;
    type: transactionType;
    recipientEmail: string;
  }) {
    const { amount, email, type, recipientEmail } = transferData;

    if (type !== transactionType.TRANSFER) {
      throw new BadRequestException("Tipo de transacción no válido");
    }

    const { data: senderRow, error: senderFetchErr } = await this.supabase
      .from("user")
      .select("id,balance,email")
      .eq("email", email)
      .single();

    if (senderFetchErr) {
      this.logger.warn(`fetch sender failed: ${senderFetchErr.message}`);
      throw new NotFoundException("Remitente no encontrado");
    }

    if (senderRow.email === recipientEmail) {
      throw new BadRequestException("No puedes transferirte saldo a ti mismo");
    }

    const { data: recipientRow, error: recipientFetchErr } = await this.supabase
      .from("user")
      .select("id,balance")
      .eq("email", recipientEmail)
      .single();

    if (recipientFetchErr) {
      this.logger.warn(`fetch recipient failed: ${recipientFetchErr.message}`);
      throw new NotFoundException("Recipiente no encontrado");
    }

    const senderCurrentBalance = senderRow.balance ?? 0;
    if (amount > senderCurrentBalance) {
      throw new BadRequestException("Fondos insuficientes");
    }

    const senderNewBalance = senderCurrentBalance - amount;
    const recipientCurrentBalance = recipientRow.balance ?? 0;
    const recipientNewBalance = recipientCurrentBalance + amount;

    const { data: updatedSender, error: senderUpdateErr } = await this.supabase
      .from("user")
      .update({ balance: senderNewBalance })
      .eq("id", senderRow.id)
      .eq("balance", senderCurrentBalance)
      .select("id,balance")
      .single();

    if (senderUpdateErr || !updatedSender) {
      this.logger.warn(
        `sender balance update failed or concurrent modification detected: ${senderUpdateErr?.message || "concurrency conflict"}`,
      );
      throw new ConflictException("Failed to update sender balance");
    }

    const { data: updatedRecipient, error: recipientUpdateErr } =
      await this.supabase
        .from("user")
        .update({ balance: recipientNewBalance })
        .eq("id", recipientRow.id)
        .select("id,balance")
        .single();

    if (recipientUpdateErr || !updatedRecipient) {
      this.logger.warn(
        `recipient balance update failed: ${recipientUpdateErr?.message}`,
      );

      await this.supabase
        .from("user")
        .update({ balance: senderCurrentBalance })
        .eq("id", senderRow.id);
      throw new ConflictException("Failed to update recipient balance");
    }

    const { data: txRow, error: txErr } = await this.supabase
      .from("transaction")
      .insert([
        {
          amount,
          sender_id: senderRow.id,
          recipient_id: recipientRow.id,
          type,
        },
      ])
      .select()
      .single();

    if (txErr || !txRow) {
      this.logger.warn(`transaction insert failed: ${txErr?.message}`);

      await this.supabase
        .from("user")
        .update({ balance: senderCurrentBalance })
        .eq("id", senderRow.id);
      await this.supabase
        .from("user")
        .update({ balance: recipientCurrentBalance })
        .eq("id", recipientRow.id);
      throw new InternalServerErrorException("Failed to record transaction");
    }

    return {
      transaction: txRow,
      senderBalance: updatedSender.balance,
      recipientBalance: updatedRecipient.balance,
    };
  }
}
