using System.Collections.Generic;
using CobLink.Api.Infrastructure;
using CobLink.Business.Services;
using CobLink.Models;
using Microsoft.AspNetCore.Mvc;

namespace CobLink.Api.Controllers
{
    public class LookupController : ApiControllerBase
    {
        private readonly ILookupService _lookupService;

        public LookupController(ILookupService lookupService)
        {
            _lookupService = lookupService;
        }

        /// <summary>Reference data for every drop-down; ids equal the enum values.</summary>
        [HttpGet]
        public ServiceResponse<LookupData> GetAll()
        {
            return Success(_lookupService.GetAll());
        }

        /// <summary>Type-ahead search over member number and names. Terms shorter than 2 characters return nothing.</summary>
        [HttpGet]
        public ServiceResponse<IList<Member>> SearchMembers(string term, int? max)
        {
            return Success(_lookupService.SearchMembers(term, max));
        }

        /// <summary>Type-ahead search over provider number, name and NPI.</summary>
        [HttpGet]
        public ServiceResponse<IList<Provider>> SearchProviders(string term, int? max)
        {
            return Success(_lookupService.SearchProviders(term, max));
        }
    }
}
