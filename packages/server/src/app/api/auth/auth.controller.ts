import {
    Controller,
    UseGuards,
    Post,
    Body,
    Request,
    Get,
    Patch,
    UseInterceptors,
    UploadedFile,
    Req,
    ForbiddenException,
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { SetCookies, Cookies } from '@nestjsplus/cookies';
import { v4 as uuidV4 } from 'uuid';
import * as lodash from 'lodash';

import { AuthService } from './auth.service';
import { UsersService } from '../../db/users/users.service';
import { ImagesService } from '../images/images.service';
import { RolesGuard, RefreshGuard } from '../../guards';
import * as models from '@dragonfish/models/users';

@Controller('')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly usersService: UsersService,
        private readonly imagesService: ImagesService,
    ) {}

    /* Login and Registration*/

    @ApiTags('auth')
    @SetCookies()
    @Post('register')
    async register(@Request() req: any, @Body() newUser: models.CreateUser): Promise<models.FrontendUser> {
        const addedUser = await this.usersService.createUser(newUser);
        const sessionId = uuidV4();
        const newSession = await this.usersService.addRefreshToken(addedUser._id, sessionId);
        return this.authService.login(addedUser, req, sessionId, newSession.expires);
    }

    @ApiTags('auth')
    @SetCookies()
    @Post('login')
    async login(
        @Request() req: any,
        @Body() loginUser: models.LoginUser,
        @Cookies() cookies: any,
    ): Promise<models.FrontendUser> {
        // Check for stray sessions from previous logout attempts that the server never received
        let oldSessionId: string | null = cookies['refreshToken'];

        const verifiedUser = await this.authService.validateUser(loginUser.email, loginUser.password);

        if (oldSessionId) {
            await this.usersService.clearRefreshToken(verifiedUser._id, oldSessionId);
        }

        if (loginUser.rememberMe) {
            const sessionId = uuidV4();
            const newSession = await this.usersService.addRefreshToken(verifiedUser._id, sessionId);
            return this.authService.login(verifiedUser, req, sessionId, newSession.expires);
        } else {
            return this.authService.login(verifiedUser, req);
        }
    }

    @ApiTags('auth')
    @UseGuards(RefreshGuard)
    @Get('refresh-token')
    async refreshToken(@Request() req: any, @Cookies() cookies: any): Promise<{ newToken: string }> {
        const refreshToken = cookies['refreshToken'];
        if (refreshToken) {
            if (await this.usersService.checkRefreshToken(req.user.sub, refreshToken)) {
                // If the refresh token is valid, let's generate a new JWT.
                return { newToken: await this.authService.refreshLogin(req.user) };
            } else {
                throw new ForbiddenException(`Your login has expired. Please log back in.`);
            }
        } else {
            throw new ForbiddenException(`Your refresh token is invalid.`);
        }
    }

    @ApiTags('auth')
    @UseGuards(RefreshGuard)
    @SetCookies()
    @Get('logout')
    async logout(@Request() req: any, @Cookies() cookies: any): Promise<void> {
        const refreshToken = cookies['refreshToken'];
        await this.usersService.clearRefreshToken(req.user.sub, refreshToken);
        this.authService.logout(req);
    }

    /* Account settings */

    @ApiTags('user')
    @UseGuards(RolesGuard([models.Roles.User]))
    @Patch('change-email')
    async changeEmail(@Request() req: any, @Body() changeEmailRequest: models.ChangeEmail) {
        return await this.authService.changeEmail(req.user, changeEmailRequest);
    }

    @ApiTags('user')
    @UseGuards(RolesGuard([models.Roles.User]))
    @Patch('change-username')
    async changeUsername(@Request() req: any, @Body() changeUsernameRequest: models.ChangeUsername) {
        // TODO: Determine how we want to handle this.
        // We should decide what--and if we need--restrictions to have around name changes.
        //return await this.authService.changeUsername(req.user, changeUsernameRequest);
    }

    @ApiTags('user')
    @UseGuards(RolesGuard([models.Roles.User]))
    @Patch('change-password')
    async changePassword(@Request() req: any, @Body() newPassword: models.ChangePassword) {
        return await this.authService.changePassword(req.user, newPassword);
    }

    @ApiTags('user')
    @UseGuards(RolesGuard([models.Roles.User]))
    @Patch('update-profile')
    async updateProfile(@Request() req: any, @Body() newProfile: models.ChangeProfile) {
        if (newProfile.bio && newProfile.bio.length > 160) {
            throw new BadRequestException('Your bio must not be longer than 160 characters.');
        }
        return await this.authService.updateProfile(req.user, newProfile);
    }

    @ApiTags('user')
    @UseGuards(RolesGuard([models.Roles.User]))
    @Post('agree-to-policies')
    async agreeToPolicies(@Request() req: any): Promise<models.FrontendUser> {
        return await this.authService.agreeToPolicies(req.user);
    }

    @ApiTags('user')
    @UseGuards(RolesGuard([models.Roles.User]))
    @UseInterceptors(FileInterceptor('avatar'))
    @Post('upload-avatar')
    async uploadAvatar(@UploadedFile() avatarImage: any, @Req() req: any) {
        const avatarUrl = await this.imagesService.upload(avatarImage, req.user.sub, 'avatars');
        const avatar = `${process.env.IMAGES_HOSTNAME}/avatars/${avatarUrl.substr(avatarUrl.lastIndexOf('/') + 1)}`;
        return await this.authService.updateAvatar(req.user, avatar);
    }

    @ApiTags('user')
    @UseGuards(RolesGuard([models.Roles.Admin, models.Roles.Moderator, models.Roles.ChatModerator]))
    @Patch('update-tagline')
    async updateTagline(@Request() req: any, @Body() tagline: models.UpdateTagline) {
        return await this.authService.updateTagline(req.user, tagline);
    }
}
