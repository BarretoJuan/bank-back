import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
} from "@nestjs/common";
import { UserService } from "./user.service";
import {
  transactionType,
} from "../transaction/dto/create-transaction.dto";
import { SupabaseAuthGuard } from "../auth/supabase.strategy";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post("deposit-balance")
  @UseGuards(SupabaseAuthGuard)
  depositBalance(@Body() body: { amount: number }, @Req() req: any) {
    return this.userService.depositOrWithdraw({
      amount: body.amount,
      email: req.user.email,
      type: transactionType.DEPOSIT,
    });
  }

  @Post("withdraw-balance")
  @UseGuards(SupabaseAuthGuard)
  withdrawBalance(@Body() body: { amount: number }, @Req() req: any) {
    return this.userService.depositOrWithdraw({
      amount: body.amount,
      email: req.user.email,
      type: transactionType.WITHDRAW,
    });
  }

  @Post("transfer-balance")
  @UseGuards(SupabaseAuthGuard)
  transferBalance(
    @Body() body: { amount: number; recipientEmail: string },
    @Req() req: any,
  ) {
    return this.userService.transfer({
      amount: body.amount,
      email: req.user.email,
      type: transactionType.TRANSFER,
      recipientEmail: body.recipientEmail,
    });
  }

  @Get()
  @UseGuards(SupabaseAuthGuard)
  getProfile(@Req() req: any) {
    return this.userService.getProfile(req.user.email);
  }

  @Get("transaction-history")
  @UseGuards(SupabaseAuthGuard)
  getTransactionHistory(
    @Req() req: any,
    @Query("type") type?: transactionType,
  ) {
    return this.userService.getTransactionHistory(req.user.email, type);
  }
}
