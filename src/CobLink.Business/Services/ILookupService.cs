using System.Collections.Generic;
using CobLink.Models;

namespace CobLink.Business.Services
{
    public interface ILookupService
    {
        LookupData GetAll();

        /// <summary>Terms shorter than two characters return an empty list.</summary>
        IList<Member> SearchMembers(string term, int? maxResults);

        IList<Provider> SearchProviders(string term, int? maxResults);
    }
}
