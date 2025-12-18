import { UsuarioService } from './usuario-service'

export class AuthService {
  /**
   * Actualiza la fecha de último login
   */
  static async updateLastLogin(authUserId: string): Promise<void> {
    await UsuarioService.updateLastLogin(authUserId)
  }
}

