/**
 * The two inferred classifications the Product Radar rests on. Every example
 * title here is a real TSM2 / PDT card seen while designing the view.
 */

import { describe, it, expect } from 'vitest';
import { teamAreaFor, groupByTeamArea, INTEGRATION_KEYWORDS, CORE_ISSUE_TYPES } from '../utils/team-area.js';
import { isParked, parkedReason, leadingTitleTags } from '../utils/parked.js';

describe('teamAreaFor', () => {
  it('files integration surfaces under Integration, whatever the customer', () => {
    expect(teamAreaFor({ summary: 'Gateway Xero - account always disconnected every day', customer: '' })).toBe('integration');
    expect(teamAreaFor({ summary: '[SAP-RFC] Send Notification to Internal Team Members of the List of Jobs Pulled', customer: 'Makino, internal' })).toBe('integration');
    expect(teamAreaFor({ summary: 'Able to handle more SOAP fields for NetSuite to handle tax', customer: 'internal' })).toBe('integration');
    expect(teamAreaFor({ summary: 'User - Import User Data from SAP via SFTP', customer: 'UOL' })).toBe('integration');
    expect(teamAreaFor({ summary: 'GST InvoiceNow', customer: 'Internal' })).toBe('integration');
  });

  it('matches keywords as whole words only', () => {
    // "sapling" must not trip the SAP rule; "tb-gateway" must.
    expect(teamAreaFor({ summary: 'Rename sapling icon', customer: 'NCL' })).toBe('project');
    expect(teamAreaFor({ summary: 'tb-gateway: Field-mapping tab unusably slow', customer: 'internal' })).toBe('integration');
    for (const kw of INTEGRATION_KEYWORDS) {
      expect(teamAreaFor({ summary: `Something about ${kw} here` })).toBe('integration');
    }
  });

  it('files internal improvement types under Core', () => {
    for (const type of CORE_ISSUE_TYPES) {
      expect(teamAreaFor({ summary: 'Tidy up the thing', issue_type: type })).toBe('core');
    }
    expect(teamAreaFor({ summary: 'Remove released branch on upstream', issue_type: 'Setup' })).toBe('core');
  });

  it('files a purely internal customer under Core, but a shared one under Project', () => {
    expect(teamAreaFor({ summary: 'Multiple Approvers: Stale draft overwrites intermediate approvals', issue_type: 'Bug', customer: 'internal' })).toBe('core');
    // "SIM, internal" is SIM's work that the internal team also cares about.
    expect(teamAreaFor({ summary: "Invoice admin's two lists are out of sync", issue_type: 'Task', customer: 'SIM, internal' })).toBe('integration'); // "sync" is an integration keyword
    expect(teamAreaFor({ summary: "Invoice admin's two lists are out of order", issue_type: 'Task', customer: 'SIM, internal' })).toBe('project');
  });

  it('defaults to Project — named-customer work is the common case', () => {
    expect(teamAreaFor({ summary: 'Incorrect Tax on downloaded Evaluation Form', issue_type: 'Bug', customer: 'productionFix' })).toBe('project');
    expect(teamAreaFor({ summary: 'budget exceeded is true even no budget added', issue_type: 'Bug', customer: 'ShopBack' })).toBe('project');
    expect(teamAreaFor({})).toBe('project');
    expect(teamAreaFor(null)).toBe('project');
  });

  it('groups a list into the three areas without losing anything', () => {
    const issues = [
      { summary: 'Gateway thing' },
      { summary: 'Plain bug', customer: 'NCL' },
      { summary: 'Improve logs', issue_type: 'Improvement' }
    ];
    const groups = groupByTeamArea(issues);
    expect(groups.integration).toHaveLength(1);
    expect(groups.project).toHaveLength(1);
    expect(groups.core).toHaveLength(1);
  });
});

describe('parked detection', () => {
  it('reads leading bracketed tags, and only leading ones', () => {
    expect(leadingTitleTags('[Archived] [Purchase Date] Purchase Date (Deal Creation Date) not showing')).toEqual(['archived', 'purchase date']);
    expect(leadingTitleTags('[RAW][NetSuite] Handle RESTlet API on gateway')).toEqual(['raw', 'netsuite']);
    expect(leadingTitleTags('Fix [Line Items] tab')).toEqual([]);
    expect(leadingTitleTags('')).toEqual([]);
    expect(leadingTitleTags(undefined)).toEqual([]);
  });

  it('recognises every title convention the team actually uses', () => {
    expect(isParked({ summary: '[Archived] fix conditional setting for advanced option field' })).toBe(true);
    expect(isParked({ summary: '[Archive] Extract list of invoice with clarification and comments' })).toBe(true);
    expect(isParked({ summary: '[KIV] Gateway - Payment status sync failed on heritagesg' })).toBe(true);
    expect(isParked({ summary: '[On Hold]Further improvement for Company Names settings' })).toBe(true);
    expect(isParked({ summary: '[WIP] Extend User Placeholder to Conditional Settings' })).toBe(true);
    expect(isParked({ summary: '[Archived][Duplicated] Files field is not working for line items in PR form' })).toBe(true);
  });

  it('does not mistake other bracketed prefixes for parking', () => {
    expect(isParked({ summary: '[RAW][NetSuite] Handle RESTlet API on gateway' })).toBe(false);
    expect(isParked({ summary: '[Bid Submission -> Submit Item Master Details popup] Fields not displayed' })).toBe(false);
    expect(isParked({ summary: '[Gateway] Credit Note Issue Date converted using wrong timezone' })).toBe(false);
    expect(isParked({ summary: '[evaluation type "number"] Incorrect required validation' })).toBe(false);
  });

  it('treats customer = Archived as parked, alone or in a list', () => {
    expect(parkedReason({ summary: 'Old bug', customer: 'Archived' })).toEqual({ source: 'customer', value: 'archived' });
    expect(isParked({ summary: 'Old bug', customer: 'NTUC, Archived' })).toBe(true);
    expect(isParked({ summary: 'Live bug', customer: 'NTUC-ARU' })).toBe(false);
  });

  it('prefers the title as the reason when both apply', () => {
    expect(parkedReason({ summary: '[KIV] thing', customer: 'Archived' })).toEqual({ source: 'title', value: '[kiv]' });
  });

  it('tolerates a missing issue', () => {
    expect(isParked(null)).toBe(false);
    expect(parkedReason(undefined)).toBeNull();
  });
});
