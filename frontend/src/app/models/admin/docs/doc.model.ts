import { Roles } from 'src/app/models/users';

export interface Doc {
    readonly _id: string;
    readonly contributors: UserInfo[];
    readonly docName: string;
    readonly docDescription: string;
    readonly docBody: string;
    readonly audit: {
        readonly approvedRoles: Roles[];
        readonly lastUpdatedBy: UserInfo;
    };
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface UserInfo {
    readonly _id: string;
    readonly username: string;
    readonly profile: {
        readonly avatar: string;
    };
}