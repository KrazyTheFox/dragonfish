import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

import { ContentModel, ProseContent } from '@pulp-fiction/models/content';
import { PaginateResult } from '@pulp-fiction/models/util';

import { calculateApprovalRating } from '../../util/functions';
import { Constants, Title } from '../../shared';

@Component({
  selector: 'app-browse',
  templateUrl: './browse.component.html',
  styleUrls: ['./browse.component.less']
})
export class BrowseComponent implements OnInit {
  works: PaginateResult<ContentModel>;

  pageNum = 1;

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    Title.setTwoPartTitle(Constants.BROWSE);  
    this.route.data.subscribe(data => {      
      this.works = data.feedData;
    });
  }

  /**
   * Handles page changing
   * 
   * @param event The new page
   */
  onPageChange(event: number) {
    this.router.navigate([], {relativeTo: this.route, queryParams: {page: event}, queryParamsHandling: 'merge'});
    this.pageNum = event;
  }

  /**
   * Calculates a work's approval rating.
   */
  calcApprovalRating(likes: number, dislikes: number) {
    return calculateApprovalRating(likes, dislikes);
  }
}
