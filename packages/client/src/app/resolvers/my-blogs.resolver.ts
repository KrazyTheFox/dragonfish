import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';

import { PaginateResult } from '@dragonfish/models/util';
import { Blog } from '@dragonfish/models/blogs';
import { NetworkService } from '../services';

@Injectable()
export class MyBlogsResolver implements Resolve<PaginateResult<Blog>> {
    pageNum: number = 1;

    constructor(private networkService: NetworkService) {}

    resolve(route: ActivatedRouteSnapshot, routerState: RouterStateSnapshot): Observable<PaginateResult<Blog>> {
        const pageNum = +route.queryParamMap.get('page');

        if (pageNum) {
            this.pageNum = pageNum;
        }

        console.log(pageNum);

        return this.networkService.fetchUserBlogs(this.pageNum);
    }
}
