import { PaginateModel, PaginateResult, Types } from 'mongoose';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { JwtPayload } from '@pulp-fiction/models/auth';
import { ContentKind, PubStatus } from '@pulp-fiction/models/content';
import { SectionForm, PublishSection } from '@pulp-fiction/models/sections';

import { isNullOrUndefined } from '../../util';
import { NotificationsService } from '../notifications/notifications.service';
import { SectionsService } from '../sections/sections.service';
import { ContentDocument } from './content.schema';
import { NotificationKind } from '@pulp-fiction/models/notifications/notification-kind';
import { UnsubscribeResult } from '../notifications/unsubscribe-result.model';
import { SectionsDocument } from '../sections/sections.schema';
import { UsersService } from '../users/users.service';
import { ApprovalQueueService } from '../approval-queue/approval-queue.service';

@Injectable()
export class ContentService {
    constructor(@InjectModel('Content') private readonly contentModel: PaginateModel<ContentDocument>,
        private readonly sectionsService: SectionsService,
        private readonly usersService: UsersService,
        private readonly queueService: ApprovalQueueService,
        private readonly notificationsService: NotificationsService) {}

    /**
     * Fetches one unpublished item from the content collection via ID and ContentKind. 
     * 
     * @param contentId A content's ID
     * @param kind A content's Kind
     * @param user The user making this request
     */
    async fetchOne(contentId: string, kind: ContentKind, user: JwtPayload): Promise<ContentDocument> {
        if (kind === ContentKind.ProseContent || kind === ContentKind.PoetryContent) {
            return await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'kind': kind, 'audit.isDeleted': false}, {autopopulate: false});
        } else {
            return await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'kind': kind, 'audit.isDeleted': false});
        }
    }

    /**
     * Fetches one published item from the content collection via ID and ContentKind.
     * 
     * @param contentId A content's ID
     * @param kind A content's Kind
     * @param user (Optional) The user making the request
     */
    async fetchOnePublished(contentId: string, kind: ContentKind, user?: JwtPayload): Promise<ContentDocument> {
        const doc = await this.contentModel.findOne({'_id': contentId, 'kind': kind, 'audit.isDeleted': false, 'audit.published': PubStatus.Published});
        if (isNullOrUndefined(user)) {
            await this.incrementViewCount(contentId);
            return doc;
        } else {
            const authorInfo = doc.author as any;
            if (authorInfo._id === user.sub) {
                return doc;
            } else {
                await this.incrementViewCount(contentId);
                return doc;
            }
        }
    }

    /**
     * Finds a bunch of content documents belonging to a user, per that user's
     * request.
     * 
     * @param user The user making the request
     */
    async fetchAll(user: JwtPayload): Promise<ContentDocument[]> {
        return await this.contentModel.find({
            'author': user.sub, 
            'audit.isDeleted': false, 
            'kind': {$ne: ContentKind.NewsContent}
        }).sort({'createdAt': 1});
    }

    /**
     * Fetches all published documents based on kind, limited by page number.
     * 
     * @param pageNum The current page
     * @param kinds The kind of document to fetch
     */
    async fetchAllPublished(pageNum: number, kinds: ContentKind[], userId?: string): Promise<PaginateResult<ContentDocument>> {
        let query = {'kind': {$in: kinds}, 'audit.isDeleted': false, 'audit.published': PubStatus.Published};
        let paginateOptions = {sort: {'audit.publishedOn': -1}, page: pageNum, limit: 15};
        
        if (userId) {
            query['author'] = userId;
        }

        return await this.contentModel.paginate(query, paginateOptions);
    }

    /**
     * Sets the `isDeleted` flag of a piece of content belonging to the specified user to `true`.
     * 
     * @param user The owner of this content
     * @param contentId The content's ID
     */
    async deleteOne(user: JwtPayload, contentId: string): Promise<void> {
        await this.contentModel.updateOne({_id: contentId, author: user.sub}, {'audit.isDeleted': true});

        // Unsubscribe the user from comments on the now-deleted work
        const unsubResult: UnsubscribeResult = await this.notificationsService.unsubscribe(user.sub, contentId, NotificationKind.CommentNotification);
        if (unsubResult !== UnsubscribeResult.Success) {
            console.error(`Failed to unsubscribe user '${user.username}' (ID: ${user.sub}) from notifications on content with ID: '${contentId}'. Reason: ${unsubResult}`);
        }
        
        // TODO: Once users have the ability to subscribe to things, we need to unsubscribe _all_ subscribers to this piece of content.
        // ...maybe work for another background queue processor
    }

    /* Sections for Prose, Poetry, and Scripts */

    /**
     * Adds a section to some content. Only applicable to Prose, Poetry, and Scripts.
     * 
     * @param user The author of the content
     * @param contentId The content ID
     * @param sectionInfo The new section's info
     */
    async createSection(user: JwtPayload, contentId: string, sectionInfo: SectionForm): Promise<SectionsDocument> {
        const work = await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {autopopulate: false});

        if (isNullOrUndefined(work)) {
            throw new UnauthorizedException(`You don't have permission to do that.`);
        } else {
            const sec: SectionsDocument = await this.sectionsService.createNewSection(sectionInfo);
            await this.contentModel.updateOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {$push: {'sections': sec._id}}, {strict: false});
            return sec;            
        }
    }

    /**
     * Updates a given section with the new info. If the section is published, subtract the old word count and then add the new word count.
     * 
     * @param user The author of the content
     * @param contentId The content ID
     * @param sectionId The section ID
     * @param sectionInfo The new section info
     */
    async editSection(user: JwtPayload, contentId: string, sectionId: string, sectionInfo: SectionForm): Promise<SectionsDocument> {
        const work = await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {autopopulate: false});

        if (isNullOrUndefined(work)) {
            throw new UnauthorizedException(`You don't have permission to do that.`);
        } else {
            const sec: SectionsDocument = await this.sectionsService.editSection(sectionId, sectionInfo);
            if (sec.published === true) {
                await this.contentModel.updateOne({ "_id": contentId, 'author': user.sub, 'audit.isDeleted': false}, {$inc: {"stats.words": -sectionInfo.oldWords}})
                await this.contentModel.updateOne({ "_id": contentId, 'author': user.sub, 'audit.isDeleted': false}, {$inc: {"stats.words": sec.stats.words}});                    
            }

            return sec;            
        }
    }

    /**
     * Publishes a section. If any change occurred in said section's publishing status, then it updates the parent content's wordcount
     * accordingly.
     * 
     * @param user The author of the content
     * @param contentId The content ID
     * @param sectionId The section ID
     * @param pubStatus The publishing status for this section
     */
    async publishSection(user: JwtPayload, contentId: string, sectionId: string, pubStatus: PublishSection): Promise<SectionsDocument> {
        const work = await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {autopopulate: false});

        if (isNullOrUndefined(work)) {
            throw new UnauthorizedException(`You don't have permission to do that.`);
        } else {
            const sec = await this.sectionsService.publishSection(sectionId, pubStatus);
            if (sec.published === true && pubStatus.oldPub === false) { // if newly published
                await this.contentModel.updateOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {$inc: {'stats.words': sec.stats.words}}, {strict: false});
            } else if (sec.published === false && pubStatus.oldPub === true) { // if unpublished
                await this.contentModel.updateOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {$inc: {'stats.words': -sec.stats.words}}, {strict: false});
            }
            return sec;
        }
    }

    /**
     * Deletes a section and updates the parent wordcount accordingly if that section was published.
     * 
     * @param user The author of the content
     * @param contentId The content ID
     * @param sectionId The section ID
     */
    async deleteSection(user: JwtPayload, contentId: string, sectionId: string): Promise<void> {
        const work = await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {autopopulate: false});

        if (isNullOrUndefined(work)) {
            throw new UnauthorizedException(`You don't have permission to do that.`);
        } else {
            const sec = await this.sectionsService.deleteSection(sectionId);
            if (sec.published === true) {
                await this.contentModel.updateOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {
                    $inc: {'stats.totWords': -sec.stats.words},
                    $pull: {'sections': sec._id}
                }, {strict: false});
            }            
        }
    }

    /**
     * Fetches all sections, published and unpublished, associated with the provided content belonging to the specified user.
     * 
     * @param user The author of the content
     * @param contentId The content ID
     */
    async fetchUserContentSections(user: JwtPayload, contentId: string): Promise<SectionsDocument[]> {
        const work = await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false}, {autopopulate: false});
        
        if (isNullOrUndefined(work)) {
            throw new UnauthorizedException(`You don't have permission to do that.`);
        } else {
            const workContent = work as any;

            return await this.sectionsService.fetchSectionsList(workContent.sections);
        }
    }

    /* Works Publishing */

    /**
     * Submits a piece of content to the approval queue.
     * 
     * @param user The author of the content
     * @param contentId The content to submit
     */
    async submitForApproval(user: JwtPayload, contentId: string): Promise<void> {
        const thisContent = await this.contentModel.findOne({'_id': contentId, 'author': user.sub, 'audit.isDeleted': false});

        if (thisContent.kind !== ContentKind.PoetryContent && thisContent.stats.words < 750) {
            throw new BadRequestException(`Content that isn't poetry needs to have a minimum wordcount of 750. `);
        }

        await this.pendingWork(contentId, user.sub);
        await this.queueService.addOneWork(contentId);
    }

    /**
     * Sets the approval status of a work to Approved.
     * 
     * @param contentId The work to approve
     * @param authorId The author of the work
     */
    async approveWork(docId: string, modId: string, contentId: string, authorId: string): Promise<void> {        
        await this.contentModel.updateOne({'_id': contentId, 'author': authorId, 'audit.isDeleted': false}, {
            'audit.published': PubStatus.Published,
            'audit.publishedOn': new Date()
        });
        await this.queueService.removeFromQueue(docId, modId);
        await this.usersService.changeWorkCount(authorId, true);
    }

    /**
     * Sets the approval status of a work to Rejected.
     * 
     * @param contentId The work to reject
     * @param authorId The author of the work
     */
    async rejectWork(docId: string, modId: string, contentId: string, authorId: string): Promise<void> {
        await this.contentModel.updateOne({'_id': contentId, 'author': authorId, 'audit.isDeleted': false}, {'audit.published': PubStatus.Rejected});
        await this.queueService.removeFromQueue(docId, modId);
    }

    /**
     * Sets the approval status of a work to Pending.
     * 
     * @param contentId The work to set to pending
     * @param authorId The author of the work
     */
    async pendingWork(contentId: string, authorId: string): Promise<void> {
        await this.contentModel.updateOne({'_id': contentId, 'author': authorId, 'audit.isDeleted': false}, {'audit.published': PubStatus.Pending});
    }

    /**
     * Adds a comment to some content.
     * 
     * @param contentId The content's ID
     */
    async addComment(contentId: string): Promise<any> {
        return await this.contentModel.updateOne({"_id": contentId}, {
            $inc: {"stats.comments": 1}
        });
    }

    /**
     * Adds a view to some content.
     * 
     * @param contentId The content's ID
     */
    async incrementViewCount(contentId: string): Promise<any> {
        return await this.contentModel.updateOne({'_id': contentId}, {
            $inc: {'stats.views': 1}
        });
    }

    /**
     * Sets the isChild field of a content document to the value of `isChild`, for folder checks.
     * 
     * @param user The owner of the content
     * @param contentId The content's ID
     */
    async setIsChild(user: JwtPayload, contentId: string, parent: Types.ObjectId): Promise<any> {
        return await this.contentModel.updateOne({'_id': contentId, 'author': user.sub}, {'audit.childOf': parent});
    }
}